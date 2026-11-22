// Server-only Cloudflare D1 storage for AI document summaries.
//
// The binding is `DB` (database `caseclarity-summaries`, see
// cloudflare.config.ts). Only summaries live here: no documents, no extracted
// text, no case records, no accounts and no keys.
//
// Schema compatibility: the table already exists in the deployed database and
// contains records from the earlier, case-ID-scoped implementation. The
// migration below is additive only:
//   * CREATE TABLE IF NOT EXISTS leaves an existing table untouched;
//   * PRAGMA table_info() inspects what is actually there;
//   * ALTER TABLE ... ADD COLUMN adds only the columns that are missing
//     (notably `workspace_id`), never drops or rewrites anything.
// Rows written before `workspace_id` existed are preserved but deliberately
// not returned to any visitor, because they cannot be attributed to a
// workspace. See db/schema.sql.
//
// All SQL is parameterised; user input never becomes SQL text.

import {
  MAX_SUMMARIES,
  parseHighlights,
  sanitizeTimestamp,
  type SummaryInput,
  type SummaryRecord,
} from "./summaries";
import { str } from "./validate";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
}

/** The subset of Cloudflare's D1Database this module uses. */
export interface D1Like {
  prepare(sql: string): D1Statement;
  batch?(statements: D1Statement[]): Promise<unknown[]>;
}

/** A D1 problem the route can turn into a clear, non-leaky response. */
export class SummaryStorageError extends Error {
  constructor(message: string, public code: "schema" | "database" = "database") {
    super(message);
  }
}

const TABLE = "document_summaries";

const CREATE_TABLE_SQL =
  `CREATE TABLE IF NOT EXISTS ${TABLE} (` +
  "id TEXT PRIMARY KEY, " +
  "workspace_id TEXT, " +
  "case_id TEXT NOT NULL, " +
  "document_id TEXT NOT NULL, " +
  "document_name TEXT NOT NULL, " +
  "summary TEXT NOT NULL, " +
  "highlights TEXT NOT NULL, " +
  "engine TEXT NOT NULL, " +
  "created_at TEXT NOT NULL)";

// Additive only. Each entry is a constant DDL fragment — never built from input.
const ADDITIVE_COLUMNS: Record<string, string> = {
  id: "id TEXT",
  workspace_id: "workspace_id TEXT",
  case_id: "case_id TEXT",
  document_id: "document_id TEXT",
  document_name: "document_name TEXT",
  summary: "summary TEXT",
  highlights: "highlights TEXT",
  engine: "engine TEXT",
  created_at: "created_at TEXT",
};

const REQUIRED_COLUMNS = Object.keys(ADDITIVE_COLUMNS);

const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_summaries_case ON ${TABLE} (case_id)`,
  `CREATE INDEX IF NOT EXISTS idx_summaries_workspace_case ON ${TABLE} (workspace_id, case_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_id ON ${TABLE} (id)`,
];

type Resolver = () => Promise<D1Like | null>;

/**
 * Cloudflare exposes bindings through the `cloudflare:workers` module. Under
 * `next dev`, `next build` and in tests that module does not exist, and a
 * missing binding is not an error: the app stays browser-local.
 */
async function resolveFromRuntime(): Promise<D1Like | null> {
  try {
    const spec = "cloudflare:workers";
    const mod = (await import(/* @vite-ignore */ spec)) as { env?: { DB?: D1Like } };
    return mod.env?.DB ?? null;
  } catch {
    return null;
  }
}

let resolver: Resolver | null = null;

/** Test hook: substitute the D1 binding. Pass null to restore the runtime. */
export function __setSummaryDbResolverForTests(next: Resolver | null): void {
  resolver = next;
}

/**
 * The D1 binding, or null when it is not configured or cannot be reached.
 * "No database" is a normal state, never an exception the caller must handle.
 */
export async function getSummaryDb(): Promise<D1Like | null> {
  try {
    return await (resolver ? resolver() : resolveFromRuntime());
  } catch {
    return null;
  }
}

// Migration runs once per isolate (and once per fake in tests).
const ready = new WeakMap<object, Promise<string[]>>();

export function ensureSummarySchema(db: D1Like): Promise<string[]> {
  const key = db as unknown as object;
  const pending = ready.get(key);
  if (pending) return pending;
  const run = migrate(db).catch((error) => {
    ready.delete(key); // let a later request retry after a transient failure
    throw error;
  });
  ready.set(key, run);
  return run;
}

async function migrate(db: D1Like): Promise<string[]> {
  try {
    await db.prepare(CREATE_TABLE_SQL).run();
  } catch (e) {
    throw new SummaryStorageError(`Could not create ${TABLE}: ${message(e)}`, "database");
  }

  const { results } = await db.prepare(`PRAGMA table_info(${TABLE})`).all();
  const columns = (results ?? []).map((r) => str(r.name, 64)).filter(Boolean);

  for (const [name, ddl] of Object.entries(ADDITIVE_COLUMNS)) {
    if (columns.includes(name)) continue;
    try {
      await db.prepare(`ALTER TABLE ${TABLE} ADD COLUMN ${ddl}`).run();
      columns.push(name);
    } catch (e) {
      // Another isolate may have added it between the PRAGMA and the ALTER.
      if (!/duplicate column/i.test(message(e))) {
        throw new SummaryStorageError(`Could not add ${name} to ${TABLE}: ${message(e)}`, "schema");
      }
      columns.push(name);
    }
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    throw new SummaryStorageError(`The ${TABLE} table is missing: ${missing.join(", ")}`, "schema");
  }

  for (const sql of CREATE_INDEXES) {
    try {
      await db.prepare(sql).run();
    } catch (e) {
      // An index is an optimisation; never fail a request over it.
      console.warn("Could not create a summaries index:", message(e));
    }
  }
  return columns;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Reads this workspace's summaries for one case. A row with no `workspace_id`
 * (written before isolation existed) never matches.
 */
export async function listSummaries(db: D1Like, workspaceId: string, caseId: string): Promise<SummaryRecord[]> {
  await ensureSummarySchema(db);
  const { results } = await db
    .prepare(
      `SELECT document_id, document_name, summary, highlights, engine, created_at ` +
        `FROM ${TABLE} WHERE workspace_id = ? AND case_id = ? ORDER BY created_at DESC`
    )
    .bind(workspaceId, caseId)
    .all();
  const now = new Date().toISOString();
  return (results ?? []).flatMap((row) => {
    const documentId = str(row.document_id, 100);
    const documentName = str(row.document_name, 255);
    const summary = str(row.summary, 2000);
    if (!documentId || !documentName || !summary) return [];
    return [{
      documentId,
      documentName,
      summary,
      highlights: parseHighlights(row.highlights),
      engine: str(row.engine, 20) || "llm",
      createdAt: sanitizeTimestamp(row.created_at, now),
    }];
  });
}

/**
 * Replaces this workspace's summaries for one case. Only the caller's rows are
 * touched; other workspaces' rows for the same case ID are untouched.
 */
export async function saveSummaries(
  db: D1Like,
  workspaceId: string,
  caseId: string,
  items: SummaryInput[],
  now = new Date().toISOString()
): Promise<number> {
  await ensureSummarySchema(db);
  const clean = items.slice(0, MAX_SUMMARIES);
  const statements: D1Statement[] = [
    db.prepare(`DELETE FROM ${TABLE} WHERE workspace_id = ? AND case_id = ?`).bind(workspaceId, caseId),
  ];
  for (const item of clean) {
    statements.push(
      db
        .prepare(
          `INSERT INTO ${TABLE} (id, workspace_id, case_id, document_id, document_name, summary, highlights, engine, created_at) ` +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          workspaceId,
          caseId,
          item.documentId,
          item.documentName,
          item.summary,
          JSON.stringify(item.highlights),
          item.engine,
          now
        )
    );
  }
  await runAll(db, statements);
  return clean.length;
}

/** Deletes this workspace's summaries for one case, or all of them. */
export async function deleteSummaries(db: D1Like, workspaceId: string, caseId?: string): Promise<number> {
  await ensureSummarySchema(db);
  const statement = caseId
    ? db.prepare(`DELETE FROM ${TABLE} WHERE workspace_id = ? AND case_id = ?`).bind(workspaceId, caseId)
    : db.prepare(`DELETE FROM ${TABLE} WHERE workspace_id = ?`).bind(workspaceId);
  const result = (await statement.run()) as { meta?: { changes?: unknown } } | undefined;
  const changes = result?.meta?.changes;
  return typeof changes === "number" ? changes : 0;
}

async function runAll(db: D1Like, statements: D1Statement[]): Promise<void> {
  // D1's batch() runs the statements as one implicit transaction, so a replace
  // never leaves a case with half its summaries.
  if (typeof db.batch === "function") {
    await db.batch(statements);
    return;
  }
  for (const statement of statements) await statement.run();
}
