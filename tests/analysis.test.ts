import { describe, it, expect } from "vitest";
import { runAnalysis, seedCases, seedDocs, checkRequiredDocs, DocItem } from "../src/lib/core";

const cases = seedCases();
const docs = seedDocs();
const byNumber = (n: string) => cases.find((c) => c.caseNumber === n)!;
const docsFor = (caseId: string) => docs.filter((d) => d.caseId === caseId);
const analyse = (n: string) => { const c = byNumber(n); return runAnalysis(c, docsFor(c.id)); };

describe("required-document checklist", () => {
  it("recognises documents by synonyms, not just the first word", () => {
    const r = checkRequiredDocs("Housing / Eviction", [
      { name: "Pay_Stubs_Mar2026.pdf", extractedText: "Gross pay $3,200/month" },
    ]);
    expect(r.items.find((i) => i.name === "Proof of Income")?.present).toBe(true);
  });

  it("does not count a denial letter that mentions 'income verification' as proof of income", () => {
    const r = checkRequiredDocs("Benefits Appeal", [
      { name: "SNAP_Denial_Letter.pdf", extractedText: "Reason: 'Failure to provide income verification.'" },
    ]);
    expect(r.missing).toContain("Proof of Income");
    expect(r.missing).not.toContain("Benefit Denial Letter");
  });

  it("computes completeness from the checklist", () => {
    expect(checkRequiredDocs("Other", []).completeness).toBe(0);
    expect(byNumber("CC-2026-001").completeness).toBe(100);
    expect(byNumber("CC-2026-002").completeness).toBe(20);
  });
});

describe("demo engine on the seeded cases (re-running gives sensible results)", () => {
  it("CC-2026-001 (complete, consistent) → proceed, client name is the tenant", () => {
    const r = analyse("CC-2026-001");
    expect(r.missing).toEqual([]);
    expect(r.contradictions).toEqual([]);
    expect(r.recommendation.title).toMatch(/Proceed/);
    const name = r.extractions.find((e) => e.fieldName === "Client Name");
    expect(name?.fieldValue).toBe("Maria Gonzalez");
    expect(r.extractions.some((e) => e.fieldValue === "Sunset Properties")).toBe(false);
  });

  it("CC-2026-002 (missing docs) → request documents, deadline in next steps", () => {
    const r = analyse("CC-2026-002");
    expect(r.recommendation.title).toMatch(/Request Missing Documents/);
    expect(r.suggestedStatus).toBe("missing_docs");
    expect(r.recommendation.nextSteps.join(" ")).toMatch(/May 28, 2026/);
  });

  it("CC-2026-003 (contradictions) → investigate; finds the salary and timeline conflicts", () => {
    const r = analyse("CC-2026-003");
    expect(r.recommendation.title).toMatch(/Investigate Contradictions/);
    expect(r.suggestedStatus).toBe("flagged");
    expect(r.contradictions.some((c) => /62,000.*69,600/.test(c))).toBe(true);
    expect(r.contradictions.some((c) => /refilled/.test(c))).toBe(true);
    expect(r.recommendation.contradictions).toEqual(r.contradictions);
  });

  it("CC-2026-006 (2 missing, no conflicts) → obtain remaining documents, never 'complete'", () => {
    const r = analyse("CC-2026-006");
    expect(r.missing.sort()).toEqual(["Sponsorship Letter", "Visa Documents"]);
    expect(r.recommendation.title).toMatch(/Obtain Remaining Documents/);
    expect(r.recommendation.summary).not.toMatch(/All required documents are present/);
  });

  it("CC-2026-005 (closed debt case) has all its documents", () => {
    expect(analyse("CC-2026-005").missing).toEqual([]);
  });

  it("labels amounts instead of 'Amount 1, Amount 2'", () => {
    const r = analyse("CC-2026-001");
    const labels = new Set(r.extractions.map((e) => e.fieldName));
    expect(labels.has("Rent")).toBe(true);
    expect(labels.has("Arrears")).toBe(true);
    expect(labels.has("Income")).toBe(true);
    expect(labels.has("Deadline")).toBe(true);
  });

  it("does not treat unrelated amounts (rent vs. medical bill) as a contradiction", () => {
    const c = byNumber("CC-2026-001");
    const extra: DocItem = { ...docsFor(c.id)[0], id: "x", name: "Extra.txt", extractedText: "Hospital bill total $9,000. Monthly rent $1,450." };
    expect(runAnalysis(c, [...docsFor(c.id), extra]).contradictions).toEqual([]);
  });

  it("flags a rent mismatch between documents", () => {
    const c = byNumber("CC-2026-001");
    const extra: DocItem = { ...docsFor(c.id)[0], id: "y", name: "Old_Lease.pdf", extractedText: "Monthly rent $1,200." };
    expect(runAnalysis(c, [...docsFor(c.id), extra]).contradictions.some((x) => /rent/i.test(x))).toBe(true);
  });

  it("warns when the client's name is not in any document", () => {
    const c = { ...byNumber("CC-2026-001"), clientName: "Someone Else" };
    const r = runAnalysis(c, docsFor(byNumber("CC-2026-001").id));
    expect(r.recommendation.uncertainties[0]).toMatch(/does not appear/);
  });
});
