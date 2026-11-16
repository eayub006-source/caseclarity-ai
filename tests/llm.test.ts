import { describe, it, expect } from "vitest";
import { validateLlmResult, buildPrompt } from "../src/lib/llm";

const docs = [
  { id: "doc-1", name: "Lease.pdf", extractedText: "Page one text.\fTenant Maria Gonzalez. Monthly rent $1,450." },
  { id: "doc-2", name: "Notice.pdf", extractedText: "Arrears $2,900 due by May 9, 2026." },
];

const good = {
  facts: [
    { field: "Rent", value: "$1,450", confidence: 95, sourceDoc: "Lease.pdf", sourcePage: 1, snippet: "Monthly rent $1,450", category: "financial" },
    { field: "Deadline", value: "May 9, 2026", confidence: 90, sourceDoc: "notice.PDF", sourcePage: 1, snippet: "due by May 9, 2026", category: "date" },
    { field: "Income", value: "$5,000", confidence: 99, sourceDoc: "Paystub.pdf", sourcePage: 1, snippet: "Gross $5,000", category: "financial" },
    { field: "Bogus", value: "x", confidence: 99, sourceDoc: "Lease.pdf", sourcePage: 1, snippet: "this text is not in the lease at all", category: "fact" },
  ],
  contradictions: ["None"],
  missing: ["Government ID"],
  recommendation: {
    title: "Recommend: Proceed",
    summary: "Looks fine.",
    reasoning: "Because.",
    confidence: 140,
    evidence: [{ claim: "Rent is $1,450", doc: "Lease.pdf", page: 7, snippet: "Monthly rent $1,450" }],
    missingInfo: ["Government ID"],
    uncertainties: [],
    nextSteps: ["Call client"],
  },
};

describe("LLM output validation", () => {
  const r = validateLlmResult(good, docs);

  it("links facts to the real document and corrects the page from the snippet", () => {
    const rent = r.facts.find((f) => f.fieldName === "Rent")!;
    expect(rent.documentId).toBe("doc-1");
    expect(rent.sourcePage).toBe(2); // the model said page 1; the text is on page 2
    expect(rent.verified).toBe(true);
  });

  it("matches document names case-insensitively", () => {
    expect(r.facts.find((f) => f.fieldName === "Deadline")!.documentId).toBe("doc-2");
  });

  it("never attaches an unknown document to another document", () => {
    const inc = r.facts.find((f) => f.fieldName === "Income")!;
    expect(inc.documentId).toBeNull();
    expect(inc.verified).toBe(false);
    expect(inc.confidence).toBeLessThanOrEqual(40);
  });

  it("marks a quote that is not in the document as unverified", () => {
    const bogus = r.facts.find((f) => f.fieldName === "Bogus")!;
    expect(bogus.verified).toBe(false);
    expect(r.unverifiedCount).toBe(2);
    expect(r.recommendation.uncertainties[0]).toMatch(/could not be matched/);
  });

  it("clamps confidence and fixes evidence pages", () => {
    expect(r.recommendation.confidence).toBe(100);
    expect(r.recommendation.evidence[0].page).toBe(2);
    expect(r.recommendation.evidence[0].verified).toBe(true);
  });

  it("rejects output without a usable recommendation", () => {
    expect(() => validateLlmResult({ facts: [] }, docs)).toThrow();
    expect(() => validateLlmResult("nope", docs)).toThrow();
    expect(() => validateLlmResult({ recommendation: { title: "" } }, docs)).toThrow();
  });

  it("marks document and page boundaries in the prompt", () => {
    const p = buildPrompt({ clientName: "Maria Gonzalez", caseType: "Housing / Eviction", title: "Eviction" }, docs, ["Lease Agreement"]);
    expect(p).toContain("=== DOCUMENT: Lease.pdf ===");
    expect(p).toContain("--- PAGE 2 ---");
  });
});
