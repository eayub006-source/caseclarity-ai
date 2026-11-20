import { describe, it, expect } from "vitest";
import * as W from "../src/lib/workspace";
import { seedCases, seedDocs, seedExtractions, seedRecommendations, seedAudit } from "../src/data/demo-data";
import type { Recommendation } from "../src/lib/core";

const NOW = "2026-11-20T12:00:00.000Z";
const ws = () => W.demoWorkspace();
const rec = (caseId: string): Recommendation => ({
  id: "ignored", caseId, title: "Recommend: test", summary: "Summary", reasoning: "", confidence: 300, status: "approved",
  evidence: [{ claim: "c", doc: "d.pdf", page: 0, snippet: "s" }], missingInfo: [], uncertainties: [], nextSteps: [], createdAt: "x", engine: "llm",
});

describe("demo dataset (src/data/demo-data.ts)", () => {
  it("is internally consistent: every reference points at an existing record", () => {
    const caseIds = new Set(seedCases().map((c) => c.id));
    const docs = seedDocs();
    const docIds = new Set(docs.map((d) => d.id));
    expect(caseIds.size).toBe(6);
    for (const d of docs) expect(caseIds.has(d.caseId)).toBe(true);
    for (const e of seedExtractions()) {
      expect(caseIds.has(e.caseId)).toBe(true);
      expect(docIds.has(e.documentId!)).toBe(true);
    }
    for (const r of seedRecommendations()) {
      expect(caseIds.has(r.caseId)).toBe(true);
      expect(r.engine).toBe("seed");
      for (const ev of r.evidence) expect(docs.some((d) => d.caseId === r.caseId && d.name === ev.doc)).toBe(true);
    }
    for (const a of seedAudit()) if (a.caseId) expect(caseIds.has(a.caseId)).toBe(true);
  });

  it("demoWorkspace() returns a fresh, newest-first copy each time", () => {
    const a = ws(), b = ws();
    expect(a).not.toBe(b);
    expect(a.cases[0].createdAt >= a.cases[a.cases.length - 1].createdAt).toBe(true);
    a.cases.pop();
    expect(W.demoWorkspace().cases).toHaveLength(6);
  });
});

describe("loading a saved workspace", () => {
  it("accepts a valid workspace and rejects anything else", () => {
    expect(W.loadWorkspace(ws())).not.toBeNull();
    expect(W.loadWorkspace(undefined)).toBeNull();
    expect(W.loadWorkspace({ ...ws(), version: 999 })).toBeNull();
    expect(W.loadWorkspace({ ...ws(), cases: "nope" })).toBeNull();
  });
});

describe("cases", () => {
  it("numbers new cases after the highest existing number", () => {
    expect(W.nextCaseNumber([{ caseNumber: "CC-2026-006" }, { caseNumber: "CC-2026-002" }], 2026)).toBe("CC-2026-007");
    const { ws: next, item } = W.createCase(ws(), { title: "  New  ", clientName: "Client", caseType: "Employment", status: "awaiting_review", priority: "high", description: "", assignedTo: "" }, "Alex Rivera", NOW);
    expect(item.caseNumber).toMatch(/-007$/);
    expect(item.title).toBe("New");
    expect(item.assignedTo).toBe("Alex Rivera");
    expect(next.cases[0].id).toBe(item.id);
  });

  it("rejects cases without a title or client and invalid updates", () => {
    expect(() => W.createCase(ws(), { title: "", clientName: "x" }, "A")).toThrow("Title is required");
    expect(() => W.createCase(ws(), { title: "x", clientName: " " }, "A")).toThrow("Client name is required");
    const id = ws().cases[0].id;
    expect(() => W.updateCase(ws(), id, { status: "bogus" as never })).toThrow("Invalid status");
    expect(() => W.updateCase(ws(), "missing", { title: "x" })).toThrow("Case not found");
    expect(W.updateCase(ws(), id, { completeness: 250 }).item.completeness).toBe(100);
  });

  it("deleting a case removes its records but keeps its audit history", () => {
    const start = ws();
    const next = W.deleteCase(start, "c1", "Alex Rivera", NOW);
    expect(next.cases.some((c) => c.id === "c1")).toBe(false);
    expect(next.docs.some((d) => d.caseId === "c1")).toBe(false);
    expect(next.extractions.some((e) => e.caseId === "c1")).toBe(false);
    expect(next.recs.some((r) => r.caseId === "c1")).toBe(false);
    expect(next.audit).toHaveLength(start.audit.length + 1);
    expect(next.audit[0].action).toBe("Case deleted");
    expect(next.audit.some((a) => a.caseId === "c1")).toBe(false); // history kept, unlinked
  });

  it("CSV import validates rows and skips duplicates", () => {
    const r = W.importCases(ws(), [
      { title: "Eviction Defense — 14-Day Notice Response", clientName: "Maria Gonzalez" }, // duplicate of a seeded case
      { title: "", clientName: "No title" },                                                // invalid
      { title: "Fresh", clientName: "New Person", priority: "urgent" },
      { title: "Fresh", clientName: "new person" },                                         // duplicate within the file
    ], NOW);
    expect([r.added, r.skipped, r.invalid]).toEqual([1, 2, 1]);
    expect(r.ws.cases[0].priority).toBe("urgent");
  });
});

describe("recommendations and human review", () => {
  it("new recommendations always start pending, with clamped values", () => {
    const { item } = W.addRecommendation(ws(), rec("c2"), NOW);
    expect(item.status).toBe("pending");
    expect(item.confidence).toBe(100);
    expect(item.evidence[0].page).toBe(1);
    expect(item.engine).toBe("llm");
  });

  it("approved or rejected recommendations are locked", () => {
    const start = W.addRecommendation(ws(), rec("c2"), NOW);
    const approved = W.reviewRecommendation(start.ws, start.item.id, { status: "approved", reviewComment: "ok" }, "Alex Rivera", NOW);
    expect(approved.item.reviewedBy).toBe("Alex Rivera");
    expect(() => W.reviewRecommendation(approved.ws, start.item.id, { status: "rejected" }, "Someone", NOW)).toThrow(/locked/);
  });

  it("a modification needs replacement text and keeps the AI's evidence", () => {
    const start = W.addRecommendation(ws(), rec("c2"), NOW);
    expect(() => W.reviewRecommendation(start.ws, start.item.id, { status: "modified" }, "A")).toThrow(/new text/);
    const m = W.reviewRecommendation(start.ws, start.item.id, { status: "modified", summary: "Edited" }, "A", NOW);
    expect(m.item.summary).toBe("Edited");
    expect(m.item.evidence).toEqual(start.item.evidence);
    expect(m.item.status).toBe("modified");
  });
});

describe("facts and audit", () => {
  it("re-running analysis replaces a case's facts and drops unknown document links", () => {
    const next = W.replaceExtractions(ws(), "c1", [
      { id: "x", caseId: "c1", documentId: "d1", fieldName: "Rent", fieldValue: "$1", confidence: 90, sourceDoc: "Lease", sourcePage: 1, sourceSnippet: "s", category: "financial" },
      { id: "y", caseId: "c1", documentId: "not-a-doc", fieldName: "Other", fieldValue: "v", confidence: 90, sourceDoc: "?", sourcePage: 1, sourceSnippet: "s", category: "fact" },
    ]);
    const facts = next.extractions.filter((e) => e.caseId === "c1");
    expect(facts).toHaveLength(2);
    expect(facts.map((f) => f.documentId)).toEqual(["d1", null]);
    expect(next.extractions.filter((e) => e.caseId === "c2")).toHaveLength(4); // other cases untouched
  });

  it("audit entries record the actor and unlink unknown cases", () => {
    const { item } = W.appendAudit(ws(), "no-such-case", "Viewed", "details", "weird-category", "Jordan Lee", NOW);
    expect(item).toMatchObject({ caseId: null, actor: "Jordan Lee", category: "general", timestamp: NOW });
    expect(() => W.appendAudit(ws(), null, "  ", "", "case", "A")).toThrow();
  });
});
