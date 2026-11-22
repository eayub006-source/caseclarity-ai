import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-config";
import {
  MAX_SUMMARY_BODY_CHARS,
  hashWorkspaceToken,
  parseJsonObject,
  sanitizeSummaryList,
  workspaceTokenFrom,
} from "@/lib/summaries";
import {
  SummaryStorageError,
  deleteSummaries,
  getSummaryDb,
  listSummaries,
  saveSummaries,
} from "@/lib/summaries-db";
import { str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Cloudflare D1 persistence for AI document summaries (binding "DB",
// database "caseclarity-summaries").
//
// Stored: document name, document id, the AI summary, its cited highlights,
// the engine and a server timestamp — scoped to the caller's workspace.
// NOT stored: original files, extracted document text, case records, accounts
// or API keys.
//
// Access control: every request must carry the workspace token minted in the
// browser (header "x-workspace-token"). The database stores only its SHA-256
// hash, and every query is scoped to it, so knowing a case ID is not enough to
// read or overwrite another visitor's summaries. This is a bearer-style
// capability, not authentication in the account sense — see README.
//
// Without the D1 binding this route answers 503 and the app keeps summaries in
// the browser (Demo Mode never depends on D1 at all).

const NO_DB =
  "Cloud summary storage is not available. AI summaries stay in this browser.";
const NO_TOKEN = "A workspace token is required to read or write summaries.";
const CROSS_SITE = "Cross-site request blocked";

function jsonError(error: string, status: number, code: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

function storageFailure(error: unknown) {
  if (error instanceof SummaryStorageError) {
    if (error.code === "schema") {
      return jsonError("Summary storage schema is not compatible. The summaries table was left unchanged.", 500, "d1_schema");
    }
  }
  // Never echo database internals to the client; keep them in the Worker log.
  console.error("Summaries D1 error:", error);
  return jsonError("Summary storage could not complete this request.", 500, "d1_error");
}

/** The workspace scope for this request: the SHA-256 of a valid token. */
async function workspaceIdFrom(req: Request): Promise<string | null> {
  const token = workspaceTokenFrom(req);
  if (!token) return null;
  return hashWorkspaceToken(token);
}

function caseIdFrom(req: Request): string {
  return str(new URL(req.url).searchParams.get("caseId"), 100);
}

export async function GET(req: Request) {
  if (!isSameOrigin(req)) return jsonError(CROSS_SITE, 403, "cross_site");

  const caseId = caseIdFrom(req);
  if (!caseId) return jsonError("caseId is required", 400, "invalid_case_id");

  const workspaceId = await workspaceIdFrom(req);
  if (!workspaceId) return jsonError(NO_TOKEN, 401, "workspace_token_required");

  const db = await getSummaryDb();
  if (!db) return jsonError(NO_DB, 503, "d1_unavailable");

  try {
    const summaries = await listSummaries(db, workspaceId, caseId);
    return NextResponse.json({ caseId, summaries, storage: "d1" });
  } catch (e) {
    return storageFailure(e);
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return jsonError(CROSS_SITE, 403, "cross_site");

  const workspaceId = await workspaceIdFrom(req);
  if (!workspaceId) return jsonError(NO_TOKEN, 401, "workspace_token_required");

  // Read with a hard size cap: a summary body is small by definition.
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_SUMMARY_BODY_CHARS) {
    return jsonError("Request body is too large.", 413, "body_too_large");
  }
  const body = parseJsonObject(raw);

  const caseId = str(body.caseId, 100);
  if (!caseId) return jsonError("caseId is required", 400, "invalid_case_id");

  if (!Array.isArray(body.summaries)) {
    return jsonError("summaries must be an array", 400, "invalid_summaries");
  }
  const summaries = sanitizeSummaryList(body.summaries);
  if (!summaries.length) {
    return jsonError(
      "No valid summaries: each needs a documentId, documentName and summary text.",
      400,
      "invalid_summaries"
    );
  }

  const db = await getSummaryDb();
  if (!db) return jsonError(NO_DB, 503, "d1_unavailable");

  try {
    const saved = await saveSummaries(db, workspaceId, caseId, summaries);
    return NextResponse.json({ saved, storage: "d1" });
  } catch (e) {
    return storageFailure(e);
  }
}

export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return jsonError(CROSS_SITE, 403, "cross_site");

  const workspaceId = await workspaceIdFrom(req);
  if (!workspaceId) return jsonError(NO_TOKEN, 401, "workspace_token_required");

  // Optional: without caseId, every summary this workspace stored is removed.
  const caseId = caseIdFrom(req) || undefined;

  const db = await getSummaryDb();
  if (!db) return jsonError(NO_DB, 503, "d1_unavailable");

  try {
    const deleted = await deleteSummaries(db, workspaceId, caseId);
    return NextResponse.json({ deleted, storage: "d1" });
  } catch (e) {
    return storageFailure(e);
  }
}
