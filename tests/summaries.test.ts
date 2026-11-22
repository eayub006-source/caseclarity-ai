import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET, POST, DELETE } from "../src/app/api/summaries/route";
import {
  MAX_SUMMARY_CHARS,
  MAX_HIGHLIGHT_CHARS,
  MAX_SUMMARIES,
  WORKSPACE_TOKEN_HEADER,
  hashWorkspaceToken,
  isWorkspaceToken,
  newWorkspaceToken,
  parseHighlights,
  parseJsonObject,
  sanitizeSummary,
  shouldSyncSummaries,
  syncCaseSummaries,
  deleteStoredSummaries,
  fetchCaseSummaries,
  saveCaseSummaries,
} from "../src/lib/summaries";
import {
  __setSummaryDbResolverForTests,
  getSummaryDb,
  type D1Like,
  type D1Statement,
} from "../src/lib/summaries-db";
import * as W from "../src/lib/workspace";

// ---------------------------------------------------------------------------
// A very small stand-in for Cloudflare D1. It understands exactly the SQL in
// src/lib/summaries-db.ts and records what was executed, so the tests can check
// parameterisation, migration behaviour and data preservation.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

class FakeD1 implements D1Like {
  columns: string[];
  rows: Row[] = [];
  executed: { sql: string; params: unknown[] }[] = [];
  failOn: string | null = null;

  constructor(opts: { legacy?: boolean; rows?: Row[] } = {}) {
    this.columns = opts.legacy
      ? ["id", "case_id", "document_id", "document_name", "summary", "highlights", "engine", "created_at"]
      : ["id", "workspace_id", "case_id", "document_id", "document_name", "summary", "highlights", "engine", "created_at"];
    this.rows = (opts.rows ?? []).map((r) => ({ ...r }));
  }

  prepare(sql: string): D1Statement {
    return this.statement(sql, []);
  }

  batch(statements: D1Statement[]): Promise<unknown[]> {
    return (async () => {
      const out: unknown[] = [];
      for (const s of statements) out.push(await s.run());
      return out;
    })();
  }

  private statement(sql: string, params: unknown[]): D1Statement {
    return {
      bind: (...values: unknown[]) => this.statement(sql, values),
      run: () => this.run(sql, params),
      all: () => this.all(sql, params),
    };
  }

  private guard(sql: string) {
    this.executed.push({ sql, params: [] });
    if (this.failOn && sql.includes(this.failOn)) throw new Error("SQLITE_ERROR: no such column: made_up");
  }

  private async run(sql: string, params: unknown[]): Promise<unknown> {
    this.guard(sql);
    this.executed[this.executed.length - 1].params = params;

    if (/^CREATE TABLE IF NOT EXISTS/i.test(sql)) return { success: true };
    if (/^CREATE (UNIQUE )?INDEX/i.test(sql)) return { success: true };

    const alter = sql.match(/^ALTER TABLE document_summaries ADD COLUMN (\w+)/i);
    if (alter) {
      const name = alter[1];
      if (this.columns.includes(name)) throw new Error(`duplicate column name: ${name}`);
      this.columns.push(name);
      return { success: true };
    }

    const insert = sql.match(/^INSERT INTO document_summaries \(([^)]+)\) VALUES/i);
    if (insert) {
      const names = insert[1].split(",").map((s) => s.trim());
      if (names.length !== params.length) throw new Error("parameter count mismatch");
      const row: Row = {};
      names.forEach((n, i) => { row[n] = params[i]; });
      if (this.rows.some((r) => r.id === row.id)) throw new Error("UNIQUE constraint failed: id");
      this.rows.push(row);
      return { success: true, meta: { changes: 1 } };
    }

    if (/^DELETE FROM document_summaries WHERE workspace_id = \? AND case_id = \?$/i.test(sql)) {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => !(r.workspace_id === params[0] && r.case_id === params[1]));
      return { success: true, meta: { changes: before - this.rows.length } };
    }
    if (/^DELETE FROM document_summaries WHERE workspace_id = \?$/i.test(sql)) {
      const before = this.rows.length;
      this.rows = this.rows.filter((r) => r.workspace_id !== params[0]);
      return { success: true, meta: { changes: before - this.rows.length } };
    }

    throw new Error(`FakeD1: unsupported SQL: ${sql}`);
  }

  private async all(sql: string, params: unknown[]): Promise<{ results: Row[] }> {
    this.guard(sql);
    this.executed[this.executed.length - 1].params = params;

    if (/^PRAGMA table_info\(document_summaries\)$/i.test(sql)) {
      return { results: this.columns.map((name, cid) => ({ cid, name, type: "TEXT" })) };
    }
    if (/^SELECT .* FROM document_summaries WHERE workspace_id = \? AND case_id = \?/i.test(sql)) {
      const results = this.rows
        .filter((r) => r.workspace_id === params[0] && r.case_id === params[1])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { results };
    }
    throw new Error(`FakeD1: unsupported SQL: ${sql}`);
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

const BASE = "http://localhost:3000/api/summaries";

function getReq(caseId: string, token?: string, headers: Record<string, string> = {}) {
  return new Request(`${BASE}?caseId=${encodeURIComponent(caseId)}`, {
    headers: { ...(token ? { [WORKSPACE_TOKEN_HEADER]: token } : {}), ...headers },
  });
}

function postReq(body: unknown, token?: string, headers: Record<string, string> = {}) {
  return new Request(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { [WORKSPACE_TOKEN_HEADER]: token } : {}),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteReq(caseId?: string, token?: string, headers: Record<string, string> = {}) {
  const url = caseId ? `${BASE}?caseId=${encodeURIComponent(caseId)}` : BASE;
  return new Request(url, {
    method: "DELETE",
    headers: { ...(token ? { [WORKSPACE_TOKEN_HEADER]: token } : {}), ...headers },
  });
}

const summary = (documentId: string, text = "The lease sets the monthly rent at $1,450.") => ({
  documentId,
  documentName: `${documentId}.pdf`,
  summary: text,
  highlights: [{ text: "Monthly rent $1,450", page: 2, verified: true }],
  engine: "llm",
});

// ---------------------------------------------------------------------------

describe("workspace token", () => {
  it("mints 256-bit lowercase hex tokens that differ every time", () => {
    const a = newWorkspaceToken();
    const b = newWorkspaceToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(isWorkspaceToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isWorkspaceToken("")).toBe(false);
    expect(isWorkspaceToken("short")).toBe(false);
    expect(isWorkspaceToken("A".repeat(64))).toBe(false);
    expect(isWorkspaceToken(undefined)).toBe(false);
  });

  it("is never stored in the clear: the hash is stable, prefixed and different per token", async () => {
    const token = newWorkspaceToken();
    const hash = await hashWorkspaceToken(token);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hash).not.toContain(token);
    expect(await hashWorkspaceToken(token)).toBe(hash);
    expect(await hashWorkspaceToken(newWorkspaceToken())).not.toBe(hash);
    await expect(hashWorkspaceToken("nope")).rejects.toThrow();
  });
});

describe("summary validation", () => {
  it("keeps only the fields D1 needs and drops document text or snippets", () => {
    const clean = sanitizeSummary({
      ...summary("doc-1"),
      extractedText: "CONFIDENTIAL FULL DOCUMENT TEXT",
      snippet: "internal snippet",
      caseId: "c1",
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    expect(clean).toEqual({
      documentId: "doc-1",
      documentName: "doc-1.pdf",
      summary: "The lease sets the monthly rent at $1,450.",
      highlights: [{ text: "Monthly rent $1,450", page: 2, verified: true }],
      engine: "llm",
    });
    expect(JSON.stringify(clean)).not.toMatch(/CONFIDENTIAL|internal snippet/);
  });

  it("rejects malformed summaries instead of guessing", () => {
    expect(sanitizeSummary(null)).toBeNull();
    expect(sanitizeSummary("nope")).toBeNull();
    expect(sanitizeSummary([])).toBeNull();
    expect(sanitizeSummary({ summary: "text" })).toBeNull();
    expect(sanitizeSummary({ documentId: "d", documentName: "d.pdf", summary: "   " })).toBeNull();
  });

  it("caps summary, highlight and highlight-count sizes", () => {
    const clean = sanitizeSummary({
      documentId: "d",
      documentName: "d.pdf",
      summary: "x".repeat(5000),
      highlights: Array.from({ length: 12 }, (_, i) => ({ text: "y".repeat(1000), page: i + 1, verified: false })),
    })!;
    expect(clean.summary).toHaveLength(MAX_SUMMARY_CHARS);
    expect(clean.highlights).toHaveLength(8);
    expect(clean.highlights[0].text).toHaveLength(MAX_HIGHLIGHT_CHARS);
  });

  it("parses stored highlights defensively", () => {
    expect(parseHighlights('[{"text":"a","page":3,"verified":true}]')).toEqual([{ text: "a", page: 3, verified: true }]);
    expect(parseHighlights("not json")).toEqual([]);
    expect(parseHighlights(undefined)).toEqual([]);
    expect(parseJsonObject("not json")).toEqual({});
    expect(parseJsonObject('{"caseId":"c1"}')).toEqual({ caseId: "c1" });
  });
});

// ---------------------------------------------------------------------------

describe("/api/summaries", () => {
  let db: FakeD1;
  let token: string;

  beforeEach(() => {
    db = new FakeD1();
    token = newWorkspaceToken();
    __setSummaryDbResolverForTests(async () => db);
  });

  afterEach(() => {
    __setSummaryDbResolverForTests(null);
    vi.restoreAllMocks();
  });

  it("saves Live AI summaries and reads them back for the same workspace", async () => {
    const body = {
      caseId: "c6",
      summaries: [
        summary("doc-a", "A short summary of the passport."),
        { ...summary("doc-b"), highlights: [{ text: "Entry date Mar 15", page: 1, verified: false }] },
      ],
    };
    const saved = await POST(postReq(body, token));
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ saved: 2, storage: "d1" });

    const read = await GET(getReq("c6", token));
    expect(read.status).toBe(200);
    const data = (await read.json()) as { caseId: string; summaries: Record<string, unknown>[]; storage: string };
    expect(data.caseId).toBe("c6");
    expect(data.storage).toBe("d1");
    expect(data.summaries).toHaveLength(2);
    expect(data.summaries.find((s) => s.documentId === "doc-a")).toMatchObject({
      documentName: "doc-a.pdf",
      summary: "A short summary of the passport.",
      engine: "llm",
    });
    expect(data.summaries.find((s) => s.documentId === "doc-b")?.highlights).toEqual([
      { text: "Entry date Mar 15", page: 1, verified: false },
    ]);
    for (const row of data.summaries) expect(typeof row.createdAt).toBe("string");
  });

  it("stores only summary columns, with parameterised SQL", async () => {
    await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] }, token));
    const inserts = db.executed.filter((e) => /^INSERT/i.test(e.sql));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    expect(inserts[0].sql).not.toContain("c6");

    const stored = db.rows[0];
    expect(Object.keys(stored).sort()).toEqual(
      ["case_id", "created_at", "document_id", "document_name", "engine", "highlights", "id", "summary", "workspace_id"].sort()
    );
    expect(JSON.stringify(stored)).not.toMatch(/extracted|CONFIDENTIAL/);
    expect(String(stored.workspace_id)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(String(stored.workspace_id)).not.toBe(token);
  });

  it("replaces only the caller's rows for that case, never all rows for the case", async () => {
    await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] }, token));
    const deletes = db.executed.filter((e) => /^DELETE/i.test(e.sql));
    expect(deletes).toHaveLength(1);
    expect(deletes[0].sql).toContain("WHERE workspace_id = ? AND case_id = ?");
    expect(deletes[0].params).toEqual([await hashWorkspaceToken(token), "c6"]);

    await POST(postReq({ caseId: "c6", summaries: [summary("doc-b")] }, token));
    const read = (await (await GET(getReq("c6", token))).json()) as { summaries: { documentId: string }[] };
    expect(read.summaries.map((s) => s.documentId)).toEqual(["doc-b"]);
  });

  it("caps and truncates incoming data", async () => {
    const many = Array.from({ length: MAX_SUMMARIES + 5 }, (_, i) => summary(`doc-${i}`, "s".repeat(4000)));
    const res = await POST(postReq({ caseId: "c6", summaries: many }, token));
    expect(await res.json()).toMatchObject({ saved: MAX_SUMMARIES });
    expect(db.rows).toHaveLength(MAX_SUMMARIES);
    expect(db.rows[0].summary).toHaveLength(MAX_SUMMARY_CHARS);
  });

  it("rejects invalid payloads with 400 and writes nothing", async () => {
    const cases: unknown[] = [
      { summaries: [summary("doc-a")] },                                    // no caseId
      { caseId: "", summaries: [summary("doc-a")] },                        // empty caseId
      { caseId: "c6" },                                                     // no summaries
      { caseId: "c6", summaries: "nope" },                                  // wrong type
      { caseId: "c6", summaries: [] },                                      // nothing to save
      { caseId: "c6", summaries: [{ documentId: "x" }] },                   // unusable entry
    ];
    for (const body of cases) {
      const res = await POST(postReq(body, token));
      expect(res.status).toBe(400);
    }
    const malformed = await POST(postReq("{not json", token));
    expect(malformed.status).toBe(400);
    const huge = await POST(postReq({ caseId: "c6", summaries: [summary("d", "x".repeat(300_000))] }, token));
    expect(huge.status).toBe(413);
    expect(db.rows).toHaveLength(0);

    const missing = await GET(new Request(`${BASE}?caseId=`));
    expect(missing.status).toBe(400);
  });

  it("requires the workspace token on every method", async () => {
    for (const res of [
      await GET(getReq("c6")),
      await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] })),
      await DELETE(deleteReq("c6")),
    ]) {
      expect(res.status).toBe(401);
    }
    const badToken = "a".repeat(64).toUpperCase();
    expect((await GET(getReq("c6", badToken))).status).toBe(401);
    expect(db.rows).toHaveLength(0);
  });

  it("blocks cross-site requests on every method", async () => {
    const evil = { origin: "https://evil.example" };
    const responses = [
      await GET(getReq("c6", token, evil)),
      await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] }, token, evil)),
      await DELETE(deleteReq("c6", token, evil)),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: "Cross-site request blocked" });
    }
    expect(db.rows).toHaveLength(0);
  });

  it("answers 503 with a clear error when the D1 binding is missing", async () => {
    __setSummaryDbResolverForTests(async () => null);
    const responses = [
      await GET(getReq("c6", token)),
      await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] }, token)),
      await DELETE(deleteReq("c6", token)),
    ];
    for (const res of responses) {
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: string; code: string };
      expect(body.code).toBe("d1_unavailable");
      expect(body.error).toMatch(/not available/i);
    }
  });

  it("resolves no binding in a Node environment (the app then stays browser-local)", async () => {
    __setSummaryDbResolverForTests(null);
    expect(await getSummaryDb()).toBeNull();
  });

  it("returns 500 without leaking database internals", async () => {
    const conlog = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failOn = "SELECT";
    const res = await GET(getReq("c6", token));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("d1_error");
    expect(body.error).not.toMatch(/SQLITE|made_up/);
    expect(conlog).toHaveBeenCalled();
  });

  it("deletes one case's summaries or all of them, scoped to the workspace", async () => {
    await POST(postReq({ caseId: "c1", summaries: [summary("doc-a")] }, token));
    await POST(postReq({ caseId: "c2", summaries: [summary("doc-b")] }, token));
    expect(db.rows).toHaveLength(2);

    const one = await DELETE(deleteReq("c1", token));
    expect(await one.json()).toMatchObject({ deleted: 1, storage: "d1" });
    expect(db.rows.map((r) => r.case_id)).toEqual(["c2"]);

    const all = await DELETE(deleteReq(undefined, token));
    expect(await all.json()).toMatchObject({ deleted: 1 });
    expect(db.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("isolation between workspaces", () => {
  let db: FakeD1;

  beforeEach(() => {
    db = new FakeD1();
    __setSummaryDbResolverForTests(async () => db);
  });
  afterEach(() => __setSummaryDbResolverForTests(null));

  it("does not expose one visitor's summaries to another visitor with the same case ID", async () => {
    const alice = newWorkspaceToken();
    const bob = newWorkspaceToken();

    await POST(postReq({ caseId: "c6", summaries: [summary("doc-alice", "Alice's private summary.")] }, alice));

    const bobRead = (await (await GET(getReq("c6", bob))).json()) as { summaries: unknown[] };
    expect(bobRead.summaries).toEqual([]);

    await POST(postReq({ caseId: "c6", summaries: [summary("doc-bob", "Bob's private summary.")] }, bob));

    const aliceRead = (await (await GET(getReq("c6", alice))).json()) as { summaries: { documentId: string; summary: string }[] };
    expect(aliceRead.summaries).toHaveLength(1);
    expect(aliceRead.summaries[0]).toMatchObject({ documentId: "doc-alice", summary: "Alice's private summary." });

    // Bob's delete never touches Alice's rows.
    await DELETE(deleteReq("c6", bob));
    const aliceagain = (await (await GET(getReq("c6", alice))).json()) as { summaries: unknown[] };
    expect(aliceagain.summaries).toHaveLength(1);
    expect(db.rows).toHaveLength(1);
  });

  it("never returns rows written before workspace isolation existed", async () => {
    const legacy = new FakeD1({
      legacy: true,
      rows: [{ id: "legacy-1", case_id: "c6", document_id: "old-doc", document_name: "Old.pdf", summary: "Old summary", highlights: "[]", engine: "llm", created_at: "2026-11-01T00:00:00.000Z" }],
    });
    __setSummaryDbResolverForTests(async () => legacy);
    const token = newWorkspaceToken();
    const data = (await (await GET(getReq("c6", token))).json()) as { summaries: unknown[] };
    expect(data.summaries).toEqual([]);
    expect(legacy.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe("database compatibility", () => {
  afterEach(() => __setSummaryDbResolverForTests(null));

  it("adds workspace_id to the existing table additively and keeps old records", async () => {
    const legacyRow = { id: "legacy-1", case_id: "c6", document_id: "old-doc", document_name: "Old.pdf", summary: "Old summary", highlights: "[]", engine: "llm", created_at: "2026-11-01T00:00:00.000Z" };
    const db = new FakeD1({ legacy: true, rows: [legacyRow] });
    __setSummaryDbResolverForTests(async () => db);
    const token = newWorkspaceToken();

    await POST(postReq({ caseId: "c6", summaries: [summary("doc-new")] }, token));
    await DELETE(deleteReq("c6", token));

    expect(db.columns).toContain("workspace_id");
    const alters = db.executed.filter((e) => /^ALTER TABLE/i.test(e.sql));
    expect(alters).toHaveLength(1);
    expect(alters[0].sql).toBe("ALTER TABLE document_summaries ADD COLUMN workspace_id TEXT");
    // The pre-existing record is untouched by the migration, the save and the delete.
    expect(db.rows).toContainEqual(legacyRow);
  });

  it("runs the additive migration once per database instance", async () => {
    const db = new FakeD1();
    __setSummaryDbResolverForTests(async () => db);
    const token = newWorkspaceToken();
    await GET(getReq("c6", token));
    await GET(getReq("c6", token));
    await POST(postReq({ caseId: "c6", summaries: [summary("doc-a")] }, token));
    expect(db.executed.filter((e) => /^PRAGMA table_info/i.test(e.sql))).toHaveLength(1);
    expect(db.executed.filter((e) => /^ALTER TABLE/i.test(e.sql))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("browser client and fallbacks", () => {
  const token = newWorkspaceToken();

  it("shows Demo Mode never contacting D1", async () => {
    const fetchImpl = vi.fn();
    expect(shouldSyncSummaries("demo")).toBe(false);
    expect(await syncCaseSummaries({ caseId: "c6", token, aiMode: "demo", fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("asks D1 for Live AI summaries and validates the response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      summaries: [
        { documentId: "doc-a", documentName: "a.pdf", summary: "Summary A", highlights: [{ text: "h", page: 1, verified: true }], engine: "llm", createdAt: "2026-11-20T10:00:00.000Z" },
        { documentId: "bad" }, // incomplete: dropped rather than guessed
      ],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await syncCaseSummaries({ caseId: "c6", token, aiMode: "llm", fetchImpl });
    expect(result).not.toBeNull();
    expect(result!.ok).toBe(true);
    if (result!.ok) {
      expect(result!.summaries).toHaveLength(1);
      expect(result!.summaries[0]).toMatchObject({ documentId: "doc-a", createdAt: "2026-11-20T10:00:00.000Z" });
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/summaries?caseId=c6"),
      expect.objectContaining({ headers: { [WORKSPACE_TOKEN_HEADER]: token } })
    );
  });

  it("falls back to the browser copy when D1 answers 503", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Summary storage is not available" }), { status: 503 }));
    const read = await fetchCaseSummaries({ caseId: "c6", token, fetchImpl });
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.status).toBe(503);
      expect(read.error).toMatch(/not available/i);
    }

    const write = await saveCaseSummaries({ caseId: "c6", token, summaries: [summary("doc-a")], fetchImpl });
    expect(write.ok).toBe(false);
  });

  it("never throws on a network failure or a malformed response", async () => {
    const offline = async () => { throw new TypeError("Failed to fetch"); };
    const read = await fetchCaseSummaries({ caseId: "c6", token, fetchImpl: offline });
    expect(read).toMatchObject({ ok: false, status: 0 });

    const write = await saveCaseSummaries({ caseId: "c6", token, summaries: [summary("doc-a")], fetchImpl: offline });
    expect(write).toMatchObject({ ok: false, status: 0 });

    const garbage = async () => new Response("<html>not json</html>", { status: 200 });
    expect(await fetchCaseSummaries({ caseId: "c6", token, fetchImpl: garbage })).toMatchObject({ ok: true, summaries: [] });

    const deleted = await deleteStoredSummaries({ token, caseId: "c6", fetchImpl: offline });
    expect(deleted.ok).toBe(false);
  });

  it("refuses to call the API without a valid token", async () => {
    const fetchImpl = vi.fn();
    expect(await saveCaseSummaries({ caseId: "c6", token: "", summaries: [summary("doc-a")], fetchImpl })).toMatchObject({ ok: false, status: 0 });
    expect((await deleteStoredSummaries({ token: "bad", fetchImpl })).ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe("workspace integration", () => {
  const NOW = "2026-11-20T12:00:00.000Z";
  it("mints a token once and keeps a valid one", () => {
    const minted = W.ensureWorkspaceToken(W.demoWorkspace(), () => "a".repeat(64));
    expect(minted.workspaceToken).toBe("a".repeat(64));
    expect(W.ensureWorkspaceToken(minted, () => "b".repeat(64))).toBe(minted);
  });

  it("drops an invalid saved token but keeps a valid one", () => {
    expect(W.loadWorkspace({ ...W.demoWorkspace(), workspaceToken: "nope" })?.workspaceToken).toBeUndefined();
    const token = newWorkspaceToken();
    expect(W.loadWorkspace({ ...W.demoWorkspace(), workspaceToken: token })?.workspaceToken).toBe(token);
  });

  it("merges D1 summaries without deleting or downgrading the browser copy", () => {
    const local = W.replaceSummaries(W.demoWorkspace(), "c1", [{ documentId: "d1", summary: "Newer local", highlights: [] }], "llm", "2026-11-20T13:00:00.000Z");
    const merged = W.mergeSummaries(local, "c1", [
      { documentId: "d1", documentName: "ignored.pdf", summary: "Older remote", highlights: [], engine: "llm", createdAt: "2026-11-20T12:00:00.000Z" },
      { documentId: "d2", documentName: "ignored.pdf", summary: "Remote only", highlights: [], engine: "llm", createdAt: "2026-11-20T12:00:00.000Z" },
      { documentId: "nope", documentName: "unknown.pdf", summary: "Unknown document", highlights: [], engine: "llm", createdAt: "2026-11-20T12:00:00.000Z" },
    ], "2026-11-20T14:00:00.000Z");

    const summaries = W.caseSummaries(merged, "c1");
    expect(summaries).toHaveLength(2);
    expect(summaries.find((s) => s.documentId === "d1")?.summary).toBe("Newer local");
    expect(summaries.find((s) => s.documentId === "d2")?.summary).toBe("Remote only");
    // The document name comes from this workspace's case file, not the payload.
    expect(summaries.find((s) => s.documentId === "d2")?.documentName).toMatch(/\.pdf$/);
    // Other cases' summaries are untouched.
    expect(W.mergeSummaries(merged, "c2", []).summaries?.filter((s) => s.caseId === "c1")).toHaveLength(2);
  });

  it("keeps the browser summaries when D1 returns nothing (fallback)", () => {
    const local = W.replaceSummaries(W.demoWorkspace(), "c1", [{ documentId: "d1", summary: "Kept", highlights: [] }], "llm", NOW);
    expect(W.caseSummaries(W.mergeSummaries(local, "c1", []), "c1")).toHaveLength(1);
    expect(W.caseSummaries(W.mergeSummaries(local, "c1", [{ documentId: "d1", summary: "" }]), "c1")[0].summary).toBe("Kept");
  });

  it("removes the case's summaries from the browser copy with the case", () => {
    const local = W.replaceSummaries(W.demoWorkspace(), "c1", [{ documentId: "d1", summary: "Gone", highlights: [] }], "llm", NOW);
    expect(W.deleteCase(local, "c1", "A", NOW).summaries).toEqual([]);
  });

  it("exposes only the requested case's summaries", () => {
    const ws = W.replaceSummaries(W.demoWorkspace(), "c1", [{ documentId: "d1", summary: "One", highlights: [] }], "llm", NOW);
    expect(W.caseSummaries(ws, "c1")).toHaveLength(1);
    expect(W.caseSummaries(ws, "c2")).toHaveLength(0);
  });
});
