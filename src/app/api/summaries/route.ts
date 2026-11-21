import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-config";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Stores ONLY AI summaries/highlights in Cloudflare D1 (binding "DB").
// Case data and files stay in the browser. Without a D1 binding it answers 503.

type Stmt = { run(): Promise<unknown>; all(): Promise<{ results: Record<string, unknown>[] }> };
type D1 = { prepare(sql: string): { bind(...v: unknown[]): Stmt } & Stmt };

async function getDb(): Promise<D1 | null> {
  try {
    const spec = "cloudflare:workers";
    const mod = await import(/* @vite-ignore */ spec);
    const db = (mod as { env?: { DB?: D1 } }).env?.DB ?? null;
    if (!db) return null;
    await db.prepare(
      "CREATE TABLE IF NOT EXISTS document_summaries (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, document_id TEXT NOT NULL, document_name TEXT NOT NULL, summary TEXT NOT NULL, highlights TEXT NOT NULL, engine TEXT NOT NULL, created_at TEXT NOT NULL)"
    ).run();
    return db;
  } catch {
    return null;
  }
}

const NO_DB = { error: "Summary database is not available" };

export async function GET(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  const caseId = str(new URL(req.url).searchParams.get("caseId"), 100);
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  const db = await getDb();
  if (!db) return NextResponse.json(NO_DB, { status: 503 });
  const { results } = await db.prepare("SELECT * FROM document_summaries WHERE case_id = ?").bind(caseId).all();
  return NextResponse.json({
    summaries: results.map((r) => ({
      documentId: r.document_id, documentName: r.document_name, summary: r.summary,
      highlights: JSON.parse(String(r.highlights || "[]")), engine: r.engine, createdAt: r.created_at,
    })),
  });
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  const body = await readJson(req);
  const caseId = str(body.caseId, 100);
  const items = Array.isArray(body.summaries) ? body.summaries.slice(0, 50) : [];
  if (!caseId || !items.length) return NextResponse.json({ error: "caseId and summaries required" }, { status: 400 });
  const db = await getDb();
  if (!db) return NextResponse.json(NO_DB, { status: 503 });

  await db.prepare("DELETE FROM document_summaries WHERE case_id = ?").bind(caseId).run();
  const now = new Date().toISOString();
  let saved = 0;
  for (const raw of items) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const documentName = str(s.documentName, 255);
    const summary = str(s.summary, 1500);
    if (!documentName || !summary) continue;
    await db.prepare(
      "INSERT INTO document_summaries (id, case_id, document_id, document_name, summary, highlights, engine, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(), caseId, str(s.documentId, 100) || documentName, documentName, summary,
      JSON.stringify(Array.isArray(s.highlights) ? s.highlights.slice(0, 8) : []),
      str(s.engine, 20) || "llm", now
    ).run();
    saved++;
  }
  return NextResponse.json({ saved });
}
