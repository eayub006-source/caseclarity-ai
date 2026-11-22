// The workspace: every case, document, fact, recommendation and audit entry.
//
// There is no database. The workspace starts as a copy of the fictional
// dataset in src/data/demo-data.ts and is saved in the visitor's browser
// (see src/lib/browser-db.ts). These functions are the rules that the old
// API routes enforced — validation, case numbering, locked reviews,
// append-only audit — written as pure functions so they can be unit-tested.
// Each one returns a NEW workspace; nothing is mutated in place.

import { AuditEntry, CASE_STATUSES, CaseItem, CaseStatus, ContradictionItem, DocItem, DocStatus, Evidence, Extraction, PRIORITIES, Recommendation, uid } from "./core";
import { seedAudit, seedCases, seedDocs, seedExtractions, seedRecommendations } from "@/data/demo-data";
import { dedupeCases } from "./csv";
import { MAX_SUMMARIES, isWorkspaceToken, newWorkspaceToken, sanitizeSummary, sanitizeTimestamp } from "./summaries";
import { int, oneOf, str, strList } from "./validate";

// 2: recommendations now carry structured contradictions (with per-side
// evidence) and an `insufficientEvidence` flag instead of plain strings.
export const WORKSPACE_VERSION = 2;

export interface Workspace {
  version: number;
  cases: CaseItem[];          // newest first
  docs: DocItem[];            // newest first
  extractions: Extraction[];  // in creation order
  recs: Recommendation[];     // newest first
  audit: AuditEntry[];        // newest first
  // AI document summaries (Live AI only). Optional so workspaces saved before
  // this field existed still load. Always kept in the browser; Live AI also
  // mirrors them to Cloudflare D1 through /api/summaries, scoped by the token
  // below. A D1 failure never removes the browser copy.
  summaries?: DocSummaryItem[];
  // A random 256-bit secret minted in this browser and saved with the
  // workspace. The summaries API stores only its SHA-256 hash, so summaries
  // are never shared between visitors just because they know a case ID.
  // Optional so workspaces saved before this field existed still load.
  workspaceToken?: string;
}

export interface DocSummaryItem {
  caseId: string;
  documentId: string;
  documentName: string;
  summary: string;
  highlights: { text: string; page: number; verified: boolean }[];
  engine: string;
  createdAt: string;
}

/** A user-facing rule violation (e.g. "Title is required"). */
export class WorkspaceError extends Error {}

const DOC_STATUSES: readonly DocStatus[] = ["uploaded", "processing", "processed", "failed"];
const AUDIT_CATEGORIES = ["case", "document", "ai", "review", "integration", "system", "general"] as const;
const MAX_IMPORT = 500;

export function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : uid() + uid();
}

const newestFirst = <T>(key: (x: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

/** A fresh copy of the fictional demo dataset. */
export function demoWorkspace(): Workspace {
  return {
    version: WORKSPACE_VERSION,
    cases: seedCases().sort(newestFirst((c) => c.createdAt)),
    docs: seedDocs().sort(newestFirst((d) => d.uploadedAt)),
    extractions: seedExtractions(),
    recs: seedRecommendations().sort(newestFirst((r) => r.createdAt)),
    audit: seedAudit().sort(newestFirst((a) => a.timestamp)),
    summaries: [],
  };
}

/** Accepts a workspace read back from browser storage; null if it is missing or not one we understand. */
export function loadWorkspace(raw: unknown): Workspace | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<Workspace>;
  if (w.version !== WORKSPACE_VERSION) return null;
  const lists = [w.cases, w.docs, w.extractions, w.recs, w.audit];
  if (!lists.every(Array.isArray)) return null;
  if (w.summaries !== undefined && !Array.isArray(w.summaries)) return null;
  // A saved workspace may predate the summaries token, or carry a token of the
  // wrong shape. Drop it rather than sending it anywhere; the store mints one.
  const { workspaceToken, ...rest } = w;
  return (isWorkspaceToken(workspaceToken) ? { ...rest, workspaceToken } : rest) as Workspace;
}

// ---------- Cases ----------

export function formatCaseNumber(n: number, year = new Date().getFullYear()): string {
  return `CC-${year}-${String(n).padStart(3, "0")}`;
}

export function nextCaseNumber(cases: Pick<CaseItem, "caseNumber">[], year = new Date().getFullYear()): string {
  let max = 0;
  for (const c of cases) {
    const m = (c.caseNumber || "").match(/-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return formatCaseNumber(max + 1, year);
}

export type NewCase = Omit<CaseItem, "id" | "caseNumber" | "createdAt" | "updatedAt" | "completeness"> & { createdAt?: string };

function cleanCase(raw: Partial<NewCase>, defaultAssignee: string): Omit<NewCase, "createdAt"> & { createdAt?: string } {
  const title = str(raw.title, 200);
  const clientName = str(raw.clientName, 120);
  if (!title) throw new WorkspaceError("Title is required");
  if (!clientName) throw new WorkspaceError("Client name is required");
  const created = typeof raw.createdAt === "string" ? new Date(raw.createdAt) : null;
  return {
    title, clientName,
    caseType: str(raw.caseType, 80) || "Other",
    status: oneOf(raw.status, CASE_STATUSES) || "awaiting_review",
    priority: oneOf(raw.priority, PRIORITIES) || "medium",
    description: str(raw.description, 4000),
    assignedTo: str(raw.assignedTo, 120) || defaultAssignee,
    ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created.toISOString() } : {}),
  };
}

export function createCase(ws: Workspace, input: Partial<NewCase>, actorName: string, now = new Date().toISOString()): { ws: Workspace; item: CaseItem } {
  const v = cleanCase(input, actorName);
  const item: CaseItem = { ...v, id: newId(), caseNumber: nextCaseNumber(ws.cases), createdAt: v.createdAt || now, updatedAt: now, completeness: 0 };
  return { ws: { ...ws, cases: [item, ...ws.cases] }, item };
}

export function updateCase(ws: Workspace, id: string, patch: Partial<CaseItem>, now = new Date().toISOString()): { ws: Workspace; item: CaseItem } {
  const current = ws.cases.find((c) => c.id === id);
  if (!current) throw new WorkspaceError("Case not found");
  const next: CaseItem = { ...current, updatedAt: now };
  if (patch.title !== undefined) { const v = str(patch.title, 200); if (!v) throw new WorkspaceError("Title cannot be empty"); next.title = v; }
  if (patch.clientName !== undefined) { const v = str(patch.clientName, 120); if (!v) throw new WorkspaceError("Client name cannot be empty"); next.clientName = v; }
  if (patch.caseType !== undefined) next.caseType = str(patch.caseType, 80) || "Other";
  if (patch.status !== undefined) { const v = oneOf<CaseStatus>(patch.status, CASE_STATUSES); if (!v) throw new WorkspaceError("Invalid status"); next.status = v; }
  if (patch.priority !== undefined) { const v = oneOf(patch.priority, PRIORITIES); if (!v) throw new WorkspaceError("Invalid priority"); next.priority = v; }
  if (patch.description !== undefined) next.description = str(patch.description, 4000);
  if (patch.assignedTo !== undefined) next.assignedTo = str(patch.assignedTo, 120);
  if (patch.completeness !== undefined) { const v = int(patch.completeness, 0, 100); if (v === undefined) throw new WorkspaceError("Invalid completeness"); next.completeness = v; }
  return { ws: { ...ws, cases: ws.cases.map((c) => (c.id === id ? next : c)) }, item: next };
}

/** Removes a case with its documents, facts and recommendations. Its audit history is kept, plus a deletion record. */
export function deleteCase(ws: Workspace, id: string, actorName: string, now = new Date().toISOString()): Workspace {
  const c = ws.cases.find((x) => x.id === id);
  if (!c) throw new WorkspaceError("Case not found");
  const entry: AuditEntry = { id: newId(), caseId: null, actor: actorName, action: "Case deleted", details: `${c.caseNumber} (${c.clientName}) deleted`, category: "case", timestamp: now };
  return {
    ...ws,
    cases: ws.cases.filter((x) => x.id !== id),
    docs: ws.docs.filter((d) => d.caseId !== id),
    extractions: ws.extractions.filter((e) => e.caseId !== id),
    recs: ws.recs.filter((r) => r.caseId !== id),
    summaries: (ws.summaries ?? []).filter((x) => x.caseId !== id),
    audit: [entry, ...ws.audit.map((a) => (a.caseId === id ? { ...a, caseId: null } : a))],
  };
}

/** CSV import: validates each row and skips duplicates (same client + title). */
export function importCases(ws: Workspace, items: Partial<NewCase>[], now = new Date().toISOString()) {
  if (items.length > MAX_IMPORT) throw new WorkspaceError(`Import at most ${MAX_IMPORT} cases at a time`);
  const valid: ReturnType<typeof cleanCase>[] = [];
  let invalid = 0;
  for (const it of items) {
    try { valid.push(cleanCase(it || {}, "Imported")); } catch { invalid++; }
  }
  const { fresh, skipped } = dedupeCases(valid, ws.cases);
  let next = ws;
  const added: CaseItem[] = [];
  for (const v of fresh) {
    const r = createCase(next, v, "Imported", now);
    next = r.ws;
    added.push(r.item);
  }
  return { ws: next, added: added.length, skipped, invalid, cases: added };
}

// ---------- Documents and facts ----------

export function addDocument(ws: Workspace, input: Omit<DocItem, "id" | "uploadedAt">, now = new Date().toISOString()): { ws: Workspace; item: DocItem } {
  if (!ws.cases.some((c) => c.id === input.caseId)) throw new WorkspaceError("Case not found");
  const name = str(input.name, 255);
  if (!name) throw new WorkspaceError("Document name is required");
  const item: DocItem = {
    id: newId(), caseId: input.caseId, name,
    type: str(input.type, 20) || "FILE",
    size: int(input.size, 0, 2_000_000_000) ?? 0,
    status: oneOf(input.status, DOC_STATUSES) || "processed",
    extractedText: typeof input.extractedText === "string" ? input.extractedText.slice(0, 2_000_000) : "",
    source: str(input.source, 80) || "Upload",
    pageCount: int(input.pageCount, 1, 100000) ?? 1,
    uploadedAt: now,
  };
  return { ws: { ...ws, docs: [item, ...ws.docs] }, item };
}

/** Re-running an analysis replaces the case's facts instead of duplicating them. */
export function replaceExtractions(ws: Workspace, caseId: string, list: Extraction[]): Workspace {
  const docIds = new Set(ws.docs.filter((d) => d.caseId === caseId).map((d) => d.id));
  const clean: Extraction[] = [];
  for (const e of list.slice(0, 500)) {
    const fieldName = str(e.fieldName, 120), fieldValue = str(e.fieldValue, 500);
    if (!fieldName || !fieldValue) continue;
    clean.push({
      id: newId(), caseId, fieldName, fieldValue,
      // A fact whose source document is unknown keeps no document link.
      documentId: e.documentId && docIds.has(e.documentId) ? e.documentId : null,
      confidence: int(e.confidence, 0, 100) ?? 80,
      sourceDoc: str(e.sourceDoc, 255),
      sourcePage: int(e.sourcePage, 1, 100000) ?? 1,
      sourceSnippet: str(e.sourceSnippet, 600),
      category: str(e.category, 30) || "fact",
      verified: e.verified !== false,
    });
  }
  return { ...ws, extractions: [...ws.extractions.filter((e) => e.caseId !== caseId), ...clean] };
}

// ---------- Recommendations and human review ----------

function cleanEvidence(v: unknown): Evidence[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 30).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const o = e as Record<string, unknown>;
    const claim = str(o.claim, 500);
    if (!claim) return [];
    return [{ claim, doc: str(o.doc, 255), page: int(o.page, 1, 100000) ?? 1, snippet: str(o.snippet, 600), verified: o.verified !== false }];
  });
}

/** Contradictions must keep at least two traceable sides; anything less is dropped. */
function cleanContradictions(v: unknown): ContradictionItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 10).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const description = str(o.description, 600);
    const evidence = Array.isArray(o.evidence) ? o.evidence.slice(0, 6).flatMap((e) => {
      if (!e || typeof e !== "object") return [];
      const x = e as Record<string, unknown>;
      const value = str(x.value, 300);
      const doc = str(x.doc, 255);
      if (!value || !doc) return [];
      return [{ value, doc, page: int(x.page, 1, 100000) ?? 1, snippet: str(x.snippet, 600), documentId: str(x.documentId, 100) || null, verified: x.verified !== false }];
    }) : [];
    if (!description || evidence.length < 2) return [];
    return [{ field: str(o.field, 120) || "Unspecified field", description, evidence }];
  });
}

/** New recommendations always start as "pending": only a human review can approve, modify or reject them. */
export function addRecommendation(ws: Workspace, input: Recommendation, now = new Date().toISOString()): { ws: Workspace; item: Recommendation } {
  if (!ws.cases.some((c) => c.id === input.caseId)) throw new WorkspaceError("Case not found");
  const title = str(input.title, 200), summary = str(input.summary, 2000);
  if (!title || !summary) throw new WorkspaceError("Title and summary are required");
  const item: Recommendation = {
    id: newId(), caseId: input.caseId, title, summary,
    reasoning: str(input.reasoning, 6000) || summary,
    confidence: int(input.confidence, 0, 100) ?? 70,
    status: "pending",
    engine: oneOf(input.engine, ["demo", "llm"] as const) || "demo",
    evidence: cleanEvidence(input.evidence),
    contradictions: cleanContradictions(input.contradictions),
    insufficientEvidence: input.insufficientEvidence === true,
    missingInfo: strList(input.missingInfo),
    uncertainties: strList(input.uncertainties),
    nextSteps: strList(input.nextSteps),
    createdAt: now,
  };
  return { ws: { ...ws, recs: [item, ...ws.recs] }, item };
}

export type ReviewPatch = { status: "approved" | "rejected" | "modified"; reviewComment?: string; summary?: string };

/**
 * Human review. Only the review fields change — the AI's evidence, confidence
 * and reasoning stay as generated. The reviewer is the signed-in user, and an
 * approved or rejected recommendation is locked.
 */
export function reviewRecommendation(ws: Workspace, id: string, patch: ReviewPatch, reviewerName: string, now = new Date().toISOString()): { ws: Workspace; item: Recommendation } {
  const current = ws.recs.find((r) => r.id === id);
  if (!current) throw new WorkspaceError("Recommendation not found");
  if (current.status === "approved" || current.status === "rejected") throw new WorkspaceError(`This recommendation was already ${current.status} and is locked.`);
  const status = oneOf(patch.status, ["approved", "rejected", "modified"] as const);
  if (!status) throw new WorkspaceError("status must be approved, rejected or modified");
  const summary = str(patch.summary, 2000);
  if (status === "modified" && !summary) throw new WorkspaceError("A modified recommendation needs the new text");
  const item: Recommendation = {
    ...current, status,
    reviewComment: str(patch.reviewComment, 2000) || undefined,
    reviewedBy: reviewerName,
    reviewedAt: now,
    ...(status === "modified" ? { summary } : {}),
  };
  return { ws: { ...ws, recs: ws.recs.map((r) => (r.id === id ? item : r)) }, item };
}

// ---------- Audit trail (append-only) ----------

export function appendAudit(ws: Workspace, caseId: string | null, action: string, details: string, category: string, actorName: string, now = new Date().toISOString()): { ws: Workspace; item: AuditEntry } {
  const a = str(action, 200);
  if (!a) throw new WorkspaceError("action is required");
  const item: AuditEntry = {
    id: newId(),
    caseId: caseId && ws.cases.some((c) => c.id === caseId) ? caseId : null,
    actor: actorName, action: a,
    details: str(details, 2000),
    category: oneOf(category, AUDIT_CATEGORIES) || "general",
    timestamp: now,
  };
  return { ws: { ...ws, audit: [item, ...ws.audit] }, item };
}

// ---------- AI document summaries ----------

/**
 * Gives a workspace its D1 isolation token if it does not have a valid one.
 * Returns the same object when nothing needs to change.
 */
export function ensureWorkspaceToken(ws: Workspace, mint: () => string = newWorkspaceToken): Workspace {
  if (isWorkspaceToken(ws.workspaceToken)) return ws;
  return { ...ws, workspaceToken: mint() };
}

/** The AI summaries this workspace holds for one case. */
export function caseSummaries(ws: Workspace, caseId: string): DocSummaryItem[] {
  return (ws.summaries ?? []).filter((s) => s.caseId === caseId);
}

/**
 * Replaces the AI document summaries of one case. Only documents that belong
 * to the case are kept, and text is length-limited like all workspace input.
 */
export function replaceSummaries(ws: Workspace, caseId: string, list: unknown[], engine = "llm", now = new Date().toISOString()): Workspace {
  const docs = new Map(ws.docs.filter((d) => d.caseId === caseId).map((d) => [d.id, d]));
  const clean: DocSummaryItem[] = [];
  for (const raw of list.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const doc = typeof o.documentId === "string" ? docs.get(o.documentId) : undefined;
    const summary = str(o.summary, 1500);
    if (!doc || !summary) continue;
    const highlights = (Array.isArray(o.highlights) ? o.highlights : []).slice(0, 8).flatMap((h) => {
      if (!h || typeof h !== "object") return [];
      const x = h as Record<string, unknown>;
      const text = str(x.text, 300);
      return text ? [{ text, page: int(x.page, 1, 100000) ?? 1, verified: x.verified === true }] : [];
    });
    clean.push({ caseId, documentId: doc.id, documentName: doc.name, summary, highlights, engine: str(engine, 20) || "llm", createdAt: now });
  }
  return { ...ws, summaries: [...(ws.summaries ?? []).filter((x) => x.caseId !== caseId), ...clean] };
}

/**
 * Merges summaries loaded from D1 into the browser copy. It never deletes or
 * downgrades what is already here: a local summary wins when it is the same
 * age or newer, and unknown documents are ignored. Used when a case page opens,
 * so a restored browser still shows its AI summaries.
 */
export function mergeSummaries(ws: Workspace, caseId: string, list: unknown[], now = new Date().toISOString()): Workspace {
  const docs = new Map(ws.docs.filter((d) => d.caseId === caseId).map((d) => [d.id, d]));
  const byDoc = new Map(caseSummaries(ws, caseId).map((s) => [s.documentId, s]));
  for (const raw of (Array.isArray(list) ? list : []).slice(0, MAX_SUMMARIES)) {
    const clean = sanitizeSummary(raw);
    if (!clean) continue;
    const doc = docs.get(clean.documentId);
    if (!doc) continue;
    const createdAt = sanitizeTimestamp(raw && typeof raw === "object" ? (raw as Record<string, unknown>).createdAt : undefined, now);
    const existing = byDoc.get(doc.id);
    if (existing && existing.createdAt >= createdAt) continue;
    byDoc.set(doc.id, {
      caseId,
      documentId: doc.id,
      documentName: doc.name,
      summary: clean.summary,
      highlights: clean.highlights,
      engine: clean.engine,
      createdAt,
    });
  }
  return { ...ws, summaries: [...(ws.summaries ?? []).filter((s) => s.caseId !== caseId), ...byDoc.values()] };
}
