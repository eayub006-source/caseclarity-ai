// AI document summaries: the data contract shared by the browser and the
// summaries API route, plus the (small) client that talks to that route.
//
// What is stored in Cloudflare D1 is ONLY the AI-generated summary of a
// document and its cited highlights. Original files, extracted text, case
// fields, accounts and API keys never leave the browser except for the Live AI
// analysis request itself (see /api/analyze).
//
// Isolation: the browser mints a random workspace token that is saved with the
// workspace in IndexedDB. The server stores only a SHA-256 hash of that token
// next to each row, and every read and write is scoped to it. A case ID alone
// is therefore not enough to read someone else's summaries — see README
// "Known limitations" for what this token is and is not.

import { int, str } from "./validate";

/** Request header that carries the workspace token. Never put it in a URL. */
export const WORKSPACE_TOKEN_HEADER = "x-workspace-token";

/** Per-case limits. They mirror the workspace rules in ./workspace.ts. */
export const MAX_SUMMARIES = 50;
export const MAX_SUMMARY_CHARS = 1500;
export const MAX_HIGHLIGHTS = 8;
export const MAX_HIGHLIGHT_CHARS = 300;
/** Reject oversized request bodies before parsing them. */
export const MAX_SUMMARY_BODY_CHARS = 256 * 1024;

export type AiMode = "llm" | "demo";

export interface SummaryHighlight {
  text: string;
  page: number;
  verified: boolean;
}

/** One document summary as validated at the edge of the system. */
export interface SummaryInput {
  documentId: string;
  documentName: string;
  summary: string;
  highlights: SummaryHighlight[];
  engine: string;
}

/** A summary read back from storage. */
export interface SummaryRecord extends SummaryInput {
  createdAt: string;
}

// ---------- Workspace token ----------

// 32 random bytes rendered as lowercase hex. The server only ever sees this
// value (to hash it), never the reverse.
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

/**
 * A fresh 256-bit workspace token. `crypto.getRandomValues` exists in every
 * browser this app supports and on Workers; the Math.random fallback only
 * keeps older browsers working in Demo Mode (their summaries stay local).
 */
export function newWorkspaceToken(): string {
  const bytes = new Uint8Array(32);
  const c = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isWorkspaceToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** The token on a request, or "" when it is missing or malformed. */
export function workspaceTokenFrom(req: Request): string {
  const value = req.headers.get(WORKSPACE_TOKEN_HEADER);
  return isWorkspaceToken(value) ? value : "";
}

/**
 * The token never reaches the database: rows are scoped by its SHA-256 hash,
 * so copying the table does not hand anyone the ability to read it through the
 * API. Web Crypto is available in browsers, on Workers and in Node tests.
 */
export async function hashWorkspaceToken(token: string): Promise<string> {
  if (!isWorkspaceToken(token)) throw new Error("Invalid workspace token");
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is not available in this environment");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

// ---------- Validation ----------

export function sanitizeHighlights(value: unknown): SummaryHighlight[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_HIGHLIGHTS).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const h = raw as Record<string, unknown>;
    const text = str(h.text, MAX_HIGHLIGHT_CHARS);
    if (!text) return [];
    return [{ text, page: int(h.page, 1, 100_000) ?? 1, verified: h.verified === true }];
  });
}

/** Highlights are stored as JSON text in D1; tolerate both forms. */
export function parseHighlights(value: unknown): SummaryHighlight[] {
  if (typeof value === "string") {
    try {
      return sanitizeHighlights(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return sanitizeHighlights(value);
}

/**
 * Validates one summary. Returns null for anything that cannot be displayed:
 * a summary without a document id, a name or text is dropped, never guessed.
 * Extra fields (extracted text, snippets, file contents) are ignored.
 */
export function sanitizeSummary(raw: unknown, defaultEngine = "llm"): SummaryInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const documentId = str(o.documentId, 100);
  const documentName = str(o.documentName, 255);
  const summary = str(o.summary, MAX_SUMMARY_CHARS);
  if (!documentId || !documentName || !summary) return null;
  return {
    documentId,
    documentName,
    summary,
    highlights: sanitizeHighlights(o.highlights),
    engine: str(o.engine, 20) || defaultEngine,
  };
}

export function sanitizeSummaryList(value: unknown, defaultEngine = "llm"): SummaryInput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SUMMARIES).flatMap((raw) => {
    const clean = sanitizeSummary(raw, defaultEngine);
    return clean ? [clean] : [];
  });
}

/** Reads back a stored row's `created_at`, falling back to the given time. */
export function sanitizeTimestamp(value: unknown, fallback: string): string {
  const text = str(value, 40);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/** Parses a small JSON object body without throwing on malformed input. */
export function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------- Browser client ----------

export type SummaryReadResult =
  | { ok: true; summaries: SummaryRecord[] }
  | { ok: false; status: number; error: string };

export type SummaryWriteResult =
  | { ok: true; saved: number }
  | { ok: false; status: number; error: string };

type FetchImpl = typeof fetch;

function failure(status: number, error: string) {
  return { ok: false as const, status, error };
}

/**
 * Summaries are an AI artifact: in Demo Mode nothing is generated, so the app
 * never contacts D1. Demo Mode therefore works with no database at all.
 */
export function shouldSyncSummaries(aiMode: AiMode): boolean {
  return aiMode === "llm";
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" && data.error ? data.error : fallback;
}

/**
 * The gate the store uses: Demo Mode produces no summaries, so it never asks
 * D1 for them. Returns null when no request was made.
 */
export async function syncCaseSummaries(opts: {
  caseId: string;
  token: string;
  aiMode: AiMode;
  fetchImpl?: FetchImpl;
}): Promise<SummaryReadResult | null> {
  if (!shouldSyncSummaries(opts.aiMode)) return null;
  return fetchCaseSummaries(opts);
}

/** Loads the D1 summaries for one case. Never throws: failures mean "stay local". */
export async function fetchCaseSummaries(opts: {
  caseId: string;
  token: string;
  fetchImpl?: FetchImpl;
}): Promise<SummaryReadResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `/api/summaries?caseId=${encodeURIComponent(opts.caseId)}`;
  try {
    const res = await doFetch(url, { method: "GET", headers: { [WORKSPACE_TOKEN_HEADER]: opts.token } });
    if (!res.ok) return failure(res.status, await readError(res, `Summary storage answered HTTP ${res.status}`));
    const data = (await res.json().catch(() => null)) as { summaries?: unknown } | null;
    const list = Array.isArray(data?.summaries) ? data.summaries : [];
    const summaries: SummaryRecord[] = list.flatMap((raw) => {
      const clean = sanitizeSummary(raw);
      if (!clean) return [];
      return [{ ...clean, createdAt: sanitizeTimestamp((raw as Record<string, unknown>)?.createdAt, new Date().toISOString()) }];
    });
    return { ok: true, summaries };
  } catch (e) {
    return failure(0, e instanceof Error ? e.message : "Network error");
  }
}

/**
 * Replaces this workspace's stored summaries for one case. Never throws:
 * callers keep the browser copy and show the local-only status.
 */
export async function saveCaseSummaries(opts: {
  caseId: string;
  token: string;
  summaries: SummaryInput[];
  fetchImpl?: FetchImpl;
}): Promise<SummaryWriteResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  if (!isWorkspaceToken(opts.token)) return failure(0, "No workspace token yet");
  if (!opts.summaries.length) return { ok: true, saved: 0 };
  try {
    const res = await doFetch("/api/summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json", [WORKSPACE_TOKEN_HEADER]: opts.token },
      body: JSON.stringify({ caseId: opts.caseId, summaries: opts.summaries }),
    });
    if (!res.ok) return failure(res.status, await readError(res, `Summary storage answered HTTP ${res.status}`));
    const data = (await res.json().catch(() => ({}))) as { saved?: unknown };
    return { ok: true, saved: typeof data.saved === "number" ? data.saved : opts.summaries.length };
  } catch (e) {
    return failure(0, e instanceof Error ? e.message : "Network error");
  }
}

/** Deletes this workspace's stored summaries (one case, or all). Best effort. */
export async function deleteStoredSummaries(opts: {
  token: string;
  caseId?: string;
  fetchImpl?: FetchImpl;
}): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  if (!isWorkspaceToken(opts.token)) return { ok: false, deleted: 0, error: "No workspace token" };
  const url = opts.caseId ? `/api/summaries?caseId=${encodeURIComponent(opts.caseId)}` : "/api/summaries";
  try {
    const res = await doFetch(url, { method: "DELETE", headers: { [WORKSPACE_TOKEN_HEADER]: opts.token } });
    if (!res.ok) return { ok: false, deleted: 0, error: await readError(res, `HTTP ${res.status}`) };
    const data = (await res.json().catch(() => ({}))) as { deleted?: unknown };
    return { ok: true, deleted: typeof data.deleted === "number" ? data.deleted : 0 };
  } catch (e) {
    return { ok: false, deleted: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}
