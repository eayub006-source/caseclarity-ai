import { describe, it, expect } from "vitest";
import * as W from "../src/lib/workspace";
import { runAnalysis, type Extraction, type Recommendation } from "../src/lib/core";
import { validateLlmResult, type LlmDoc } from "../src/lib/llm";

// The browser-side workflow (upload → extract → Live AI analysis → facts →
// recommendation → human review → audit) driven through the exact store rules
// the case page uses. Fictional documents only.

const NOW = "2026-11-20T12:00:00.000Z";

const DOCS: LlmDoc[] = [
  { id: "doc-1", name: "Lease.txt", extractedText: "Tenant Maria Gonzalez. Monthly rent $1,450." },
  { id: "doc-2", name: "Notice.txt", extractedText: "Arrears $2,900 due by May 9, 2026." },
];

const LLM_PAYLOAD = {
  facts: [
    { field: "Rent", value: "$1,450", confidence: 95, sourceDoc: "Lease.txt", sourcePage: 1, snippet: "Monthly rent $1,450", category: "financial" },
    { field: "Arrears", value: "$2,900", confidence: 90, sourceDoc: "Notice.txt", sourcePage: 1, snippet: "Arrears $2,900 due by May 9, 2026", category: "financial" },
  ],
  contradictions: [{
    field: "Amount",
    description: "The lease rent and the claimed arrears cannot both be current.",
    evidence: [
      { value: "$1,450", doc: "Lease.txt", page: 1, snippet: "Monthly rent $1,450" },
      { value: "$2,900", doc: "Notice.txt", page: 1, snippet: "Arrears $2,900 due by May 9, 2026" },
    ],
  }],
  missing: ["Proof of Income"],
  recommendation: {
    title: "Recommend: Investigate the arrears figure",
    summary: "Two amounts conflict across documents.",
    reasoning: "The documents state different amounts.",
    confidence: 70,
    sufficientEvidence: true,
    evidence: [{ claim: "Rent is $1,450", doc: "Lease.txt", page: 1, snippet: "Monthly rent $1,450" }],
    missingInfo: ["Proof of Income"],
    uncertainties: ["Which amount is current is unclear."],
    nextSteps: ["Confirm the arrears with the client"],
  },
};

function seedCase(ws: W.Workspace) {
  const c = W.createCase(ws, { title: "Eviction Defense", clientName: "Maria Gonzalez", caseType: "Housing / Eviction", status: "awaiting_review", priority: "high", description: "", assignedTo: "Alex Rivera" }, "Alex Rivera", NOW);
  let next = c.ws;
  const docs: LlmDoc[] = [];
  for (const d of DOCS) {
    const r = W.addDocument(next, { caseId: c.item.id, name: d.name, type: "TXT", size: 100, status: "processed", extractedText: d.extractedText, pageCount: 1, source: "Upload" }, NOW);
    next = r.ws;
    docs.push({ id: r.item.id, name: r.item.name, extractedText: r.item.extractedText });
  }
  return { ws: next, caseId: c.item.id, docs };
}

// Mirrors runAI() in src/app/(app)/cases/[id]/page.tsx for the LLM branch.
function applyLlmResult(ws: W.Workspace, caseId: string, raw: unknown, llmDocs: LlmDoc[]) {
  const result = validateLlmResult(raw, llmDocs);
  const exs: Extraction[] = result.facts.map((f) => ({ id: W.newId(), caseId, ...f }));
  let next = W.replaceExtractions(ws, caseId, exs);
  const r: Recommendation = {
    id: W.newId(), caseId, ...result.recommendation,
    contradictions: result.contradictions, status: "pending", engine: "llm", createdAt: NOW,
  };
  next = W.addRecommendation(next, r).ws;
  return { ws: next, result, rec: next.recs.find((x) => x.caseId === caseId)! };
}

describe("Live AI workflow (analysis → recommendation → review → audit)", () => {
  it("keeps provenance on every fact and starts the recommendation as pending", () => {
    const { ws, caseId, docs } = seedCase(W.demoWorkspace());
    const { ws: next, rec } = applyLlmResult(ws, caseId, LLM_PAYLOAD, docs);
    const facts = next.extractions.filter((e) => e.caseId === caseId);
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.documentId && f.sourceDoc && f.sourcePage >= 1 && f.sourceSnippet && f.verified !== false)).toBe(true);
    expect(rec.status).toBe("pending");
    expect(rec.engine).toBe("llm");
    expect(rec.evidence[0].doc).toBe("Lease.txt");
  });

  it("stores an unverifiable citation as unverified — never as verified evidence", () => {
    const { ws, caseId, docs } = seedCase(W.demoWorkspace());
    const payload = { ...LLM_PAYLOAD, facts: [{ ...LLM_PAYLOAD.facts[0], sourceDoc: "Ghost.txt", snippet: "not in any document" }] };
    const { ws: next } = applyLlmResult(ws, caseId, payload, docs);
    const fact = next.extractions.find((e) => e.fieldName === "Rent")!;
    expect(fact.verified).toBe(false);
    expect(fact.documentId).toBeNull();
    expect(fact.confidence).toBeLessThanOrEqual(40);
  });

  it("drops a contradiction that cannot show two traceable sides", () => {
    const { ws, caseId, docs } = seedCase(W.demoWorkspace());
    const payload = {
      ...LLM_PAYLOAD,
      contradictions: [{
        field: "Amount",
        description: "Unsupported conflict.",
        evidence: [{ value: "$1", doc: "Ghost.txt", page: 1, snippet: "nowhere" }],
      }],
    };
    const { ws: next, rec } = applyLlmResult(ws, caseId, payload, docs);
    expect(rec.contradictions).toEqual([]);
    expect(next.extractions.every((e) => e.verified !== false)).toBe(true);
  });

  it("a human decision is required: approving locks the recommendation and keeps the AI evidence", () => {
    const { ws, caseId, docs } = seedCase(W.demoWorkspace());
    const { ws: next, rec } = applyLlmResult(ws, caseId, LLM_PAYLOAD, docs);
    const reviewed = W.reviewRecommendation(next, rec.id, { status: "approved", reviewComment: "Verified against originals." }, "Alex Rivera", NOW);
    const saved = reviewed.item;
    expect(saved.status).toBe("approved");
    expect(saved.reviewedBy).toBe("Alex Rivera");
    expect(saved.evidence).toEqual(rec.evidence); // the AI's evidence is untouched
    expect(() => W.reviewRecommendation(reviewed.ws, rec.id, { status: "rejected" }, "Alex Rivera", NOW)).toThrow(/locked/);
  });

  it("records the analysis and the review in the audit trail", () => {
    const { ws, caseId, docs } = seedCase(W.demoWorkspace());
    const { ws: next, rec } = applyLlmResult(ws, caseId, LLM_PAYLOAD, docs);
    let audited = W.appendAudit(next, caseId, "AI analysis completed (LLM)", "2 facts extracted. Recommendation: Investigate (confidence 70, uncalibrated heuristic)", "ai", "Alex Rivera", NOW).ws;
    audited = W.appendAudit(audited, caseId, "Recommendation approved", "Verified against originals.", "review", "Alex Rivera", NOW).ws;
    const actions = audited.audit.filter((a) => a.caseId === caseId).map((a) => a.action);
    expect(actions).toContain("AI analysis completed (LLM)");
    expect(actions).toContain("Recommendation approved");
  });

  it("the demo engine fallback also produces a pending recommendation with cited evidence", () => {
    const { ws, caseId } = seedCase(W.demoWorkspace());
    const c = ws.cases.find((x) => x.id === caseId)!;
    const result = runAnalysis(c, ws.docs.filter((d) => d.caseId === caseId));
    let next = W.replaceExtractions(ws, caseId, result.extractions);
    next = W.addRecommendation(next, result.recommendation).ws;
    const rec = next.recs.find((x) => x.caseId === caseId)!;
    expect(rec.status).toBe("pending");
    expect(rec.engine).toBe("demo");
    expect(rec.evidence.every((e) => e.doc && e.page >= 1 && e.snippet)).toBe(true);
    expect(rec.missingInfo.length).toBeGreaterThan(0);
  });
});
