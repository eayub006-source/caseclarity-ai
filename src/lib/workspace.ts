// The workspace: every case, document, fact, recommendation and audit entry.
//
// There is no database. The workspace starts as a copy of the fictional
// dataset in src/data/demo-data.ts and is saved in the visitor's browser
// (see src/lib/browser-db.ts). These functions are the rules that the old
// API routes enforced — validation, case numbering, locked reviews,
// append-only audit — written as pure functions so they can be unit-tested.
// Each one returns a NEW workspace; nothing is mutated in place.

import { AuditEntry, CASE_STATUSES, CaseItem, CaseStatus, DocItem, DocStatus, Evidence, Extraction, PRIORITIES, Recommendation, uid } from "./core";
import { seedAudit, seedCases, seedDocs, seedExtractions, seedRecommendations } from "@/data/demo-data";
import { dedupeCases } from "./csv";
import { int, oneOf, str, strList } from "./validate";

export const WORKSPACE_VERSION = 1;

export interface Workspace {
  version: number;
  cases: CaseItem[];          // newest first
  docs: DocItem[];            // newest first
  extractions: Extraction[];  // in creation order
  recs: Recommendation[];     // newest first
  audit: AuditEntry[];        // newest first
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
  };
}

/** Accepts a workspace read back from browser storage; null if it is missing or not one we understand. */
export function loadWorkspace(raw: unknown): Workspace | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Partial<Workspace>;
  if (w.version !== WORKSPACE_VERSION) return null;
  const lists = [w.cases, w.docs, w.extractions, w.recs, w.audit];
  if (!lists.every(Array.isArray)) return null;
  return w as Workspace;
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
    contradictions: strList(input.contradictions),
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
