// CaseClarity AI — core types, required-document checklist & explainable AI engine (Demo Mode).
// The fictional dataset lives in src/data/demo-data.ts.
export type CaseStatus = "awaiting_review" | "in_progress" | "completed" | "missing_docs" | "flagged";
export type DocStatus = "uploaded" | "processing" | "processed" | "failed";
export type RecStatus = "pending" | "approved" | "rejected" | "modified";

export interface CaseItem {
  id: string; caseNumber: string; title: string; clientName: string; caseType: string;
  status: CaseStatus; priority: "low" | "medium" | "high" | "urgent";
  description: string; assignedTo: string; createdAt: string; updatedAt: string;
  completeness: number; // 0-100
}
export interface DocItem {
  id: string; caseId: string; name: string; type: string; size: number;
  status: DocStatus; extractedText: string; pageCount: number; uploadedAt: string; source: string;
}
export interface Extraction {
  id: string; caseId: string; documentId: string | null; fieldName: string; fieldValue: string;
  confidence: number; sourceDoc: string; sourcePage: number; sourceSnippet: string; category: string;
  verified?: boolean; // false = cited document/snippet not found in the case file
}
export interface Evidence { claim: string; doc: string; page: number; snippet: string; verified?: boolean; }

// A contradiction is only useful if every side can be traced to a source.
// Each evidence item is one conflicting value with its own document, page and
// verbatim snippet; a contradiction must carry at least two of them.
export interface ContradictionEvidence {
  value: string; doc: string; page: number; snippet: string;
  documentId: string | null; verified: boolean;
}
export interface ContradictionItem {
  field: string; // the comparable field, e.g. "Annual income" or "Monthly rent"
  description: string; // what conflicts and why it matters
  evidence: ContradictionEvidence[]; // two or more independently traceable values
}
export type Engine = "seed" | "demo" | "llm";
export interface Recommendation {
  id: string; caseId: string; title: string; summary: string; reasoning: string;
  confidence: number; status: RecStatus; evidence: Evidence[]; missingInfo: string[];
  uncertainties: string[]; nextSteps: string[]; createdAt: string; reviewedBy?: string; reviewComment?: string; reviewedAt?: string;
  engine?: Engine; contradictions?: ContradictionItem[];
  insufficientEvidence?: boolean; // the AI could not ground a conclusion in the documents
}
export interface AuditEntry {
  id: string; caseId: string | null; actor: string; action: string; details: string;
  category: string; timestamp: string;
}
export interface User { id?: string; name: string; email: string; role: string; roleLabel: string; org: string; }
export interface AppConfig { aiMode: "llm" | "demo"; model: string | null; }

export const CASE_STATUSES: CaseStatus[] = ["awaiting_review", "in_progress", "completed", "missing_docs", "flagged"];
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const CASE_TYPES = ["Housing / Eviction", "Benefits Appeal", "Employment", "Family Law", "Immigration", "Consumer Debt", "Other"];
export const REQUIRED_DOCS: Record<string, string[]> = {
  "Housing / Eviction": ["Government ID", "Lease Agreement", "Eviction Notice", "Proof of Income", "Rent Payment History"],
  "Benefits Appeal": ["Government ID", "Benefit Denial Letter", "Proof of Income", "Household Composition", "Medical Evidence (if applicable)"],
  "Employment": ["Government ID", "Employment Contract", "Pay Stubs", "Termination Letter", "Correspondence with Employer"],
  "Family Law": ["Government ID", "Birth Certificates", "Financial Disclosure", "Court Orders"],
  "Immigration": ["Passport / ID", "Visa Documents", "Sponsorship Letter", "Proof of Residence"],
  "Consumer Debt": ["Government ID", "Creditor Statements", "Income Proof", "Debt Collection Letters"],
  "Other": ["Government ID", "Supporting Evidence"],
};

// ---------- Required-document checklist ----------
// Each requirement is recognised by synonyms in the file name OR the extracted
// text (e.g. "Pay_Stubs_Mar2026.pdf" satisfies "Proof of Income").
const INCOME_RE = /\b(pay ?stubs?|paystubs?|payslips?|pay slips?|gross pay|proof of income|income letter|employer letter|w-?2|monthly income)\b/i;
const DOC_MATCHERS: Record<string, RegExp> = {
  "Government ID": /\b(government id|state id|id card|identity card|driver'?s licen[cs]e|drivers licen[cs]e|passport|identification card)\b/i,
  "Passport / ID": /\b(passport|government id|state id|id card|identification card)\b/i,
  "Lease Agreement": /\blease\b/i,
  "Eviction Notice": /\b(eviction|notice to vacate|notice to quit)\b/i,
  "Proof of Income": INCOME_RE,
  "Income Proof": INCOME_RE,
  "Rent Payment History": /\b(rent payment history|payment history|rent ledger|rent receipts?)\b/i,
  "Benefit Denial Letter": /\b(denial|notice of denial|denied)\b/i,
  "Household Composition": /\b(household composition|household members|household size)\b/i,
  "Medical Evidence (if applicable)": /\b(medical records?|doctor'?s note|physician|diagnosis|medical evidence)\b/i,
  "Employment Contract": /\b(employment contract|employment agreement|offer letter)\b/i,
  "Pay Stubs": /\b(pay ?stubs?|paystubs?|payslips?|pay slips?)\b/i,
  "Termination Letter": /\b(termination|dismissal|separation letter)\b/i,
  "Correspondence with Employer": /\b(e-?mail|correspondence|letter to hr|hr reply|memo)\b/i,
  "Birth Certificates": /\bbirth certificates?\b/i,
  "Financial Disclosure": /\bfinancial disclosure\b/i,
  "Court Orders": /\b(court order|custody order|judgment|order dated)\b/i,
  "Visa Documents": /\bvisa\b/i,
  "Sponsorship Letter": /\bsponsor(ship)?\b/i,
  "Proof of Residence": /\b(utility bill|proof of residence|confirms current residence|residence proof)\b/i,
  "Creditor Statements": /\b(creditor statement|account statement|statement of account)\b/i,
  "Debt Collection Letters": /\b(collection letter|debt collection|collections|debt validation)\b/i,
  "Supporting Evidence": /[\s\S]/,
};

export interface ChecklistItem { name: string; present: boolean; matchedDoc?: string; }
export interface ChecklistResult { items: ChecklistItem[]; missing: string[]; completeness: number; }

export function checkRequiredDocs(caseType: string, docs: Pick<DocItem, "name" | "extractedText">[]): ChecklistResult {
  const required = REQUIRED_DOCS[caseType] || REQUIRED_DOCS["Other"];
  const items = required.map((name) => {
    const re = DOC_MATCHERS[name] || new RegExp(`\\b${name.split(" ")[0].replace(/[^a-z]/gi, "")}`, "i");
    const hit = docs.find((d) => re.test(d.name.replace(/[_\-.]+/g, " ") + "\n" + (d.extractedText || "")));
    return { name, present: !!hit, matchedDoc: hit?.name };
  });
  const missing = items.filter((i) => !i.present).map((i) => i.name);
  const completeness = Math.round(((items.length - missing.length) / Math.max(1, items.length)) * 100);
  return { items, missing, completeness };
}

// ---------- Explainable AI engine (Demo Mode — deterministic, no LLM key needed) ----------
// Facts are extracted per document and per page. Every fact keeps its actual
// documentId, filename, page number and supporting snippet. Pages are separated
// by \f (form feed) in extractedText (see src/lib/extract.ts).

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_RE = new RegExp(`\\b((?:${MONTHS}) \\d{1,2}, \\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{4}-\\d{2}-\\d{2})\\b`, "g");
const MONEY_RE = /\$\s?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(?:\/|per\s+)\s*(month|mo|year|yr|annum|hour|hr)\b)?/gi;
const MAX_PER_PAGE = 6;

function dateLabel(before: string): string {
  const b = before.toLowerCase();
  if (/\b(dob|date of birth|born)\b/.test(b)) return "Date of Birth";
  if (/\b(deadline|due|no later than)\b|\b(by|before)\s*$/.test(b)) return "Deadline";
  if (/\b(effective|last day)\b/.test(b)) return "Effective Date";
  if (/\bservice\b/.test(b)) return "Date of Service";
  if (/\bentry\b/.test(b)) return "Entry Date";
  if (/\brefilled\b/.test(b)) return "Event Date";
  if (/\b(dated|date)\b/.test(b)) return "Document Date";
  return "Date";
}

// Picks the money keyword closest to the amount.
const AMOUNT_KINDS: [string, RegExp][] = [
  ["Rent", /\brent\b/g],
  ["Arrears", /\b(arrears|owed|past due|behind)\b/g],
  ["Income", /\b(gross|net|salary|income|wages?|pay(?!ment)|earnings?|raise)\b/g],
  ["Hourly Rate", /\bhourly\b/g],
  ["Bill", /\b(bill|total|charges?|cost)\b/g],
  ["Debt", /\b(debt|disputed|balance|claimed)\b/g],
];
function amountLabel(before: string): string {
  const b = before.toLowerCase();
  let best = "Amount", bestIdx = -1;
  for (const [label, re] of AMOUNT_KINDS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(b))) if (m.index > bestIdx) { bestIdx = m.index; best = label; }
  }
  return best;
}

function annualise(value: number, unit?: string): number | null {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (u === "month" || u === "mo") return value * 12;
  if (u === "year" || u === "yr" || u === "annum") return value;
  return null;
}

const money = (n: number) => "$" + n.toLocaleString("en-US");

export interface AnalysisResult {
  extractions: Extraction[];
  recommendation: Recommendation;
  contradictions: ContradictionItem[];
  missing: string[];
  completeness: number;
  suggestedStatus: CaseStatus;
  summary: string;
}

export function suggestStatus(missingCount: number, contradictionCount: number): CaseStatus {
  if (missingCount >= 3) return "missing_docs";
  if (contradictionCount > 0) return "flagged";
  return "awaiting_review";
}

export function runAnalysis(c: CaseItem, docs: DocItem[]): AnalysisResult {
  const extractions: Extraction[] = [];
  const incomes: { annual: number; ex: Extraction }[] = [];
  const rents: { value: number; ex: Extraction }[] = [];
  const uncertainties: string[] = [];
  let nameFound = false;

  const snippetAround = (pageText: string, idx: number, len: number) =>
    pageText.slice(Math.max(0, idx - 40), idx + len + 30).replace(/\s+/g, " ").trim();
  const push = (d: DocItem, page: number, fieldName: string, fieldValue: string, confidence: number, snippet: string, category: string) => {
    const ex: Extraction = { id: uid(), caseId: c.id, documentId: d.id, fieldName, fieldValue, confidence, sourceDoc: d.name, sourcePage: page, sourceSnippet: snippet, category, verified: true };
    extractions.push(ex);
    return ex;
  };

  for (const d of docs) {
    const pages = (d.extractedText || "").split("\f");
    pages.forEach((pageText, pi) => {
      const page = pi + 1;

      // Client name: look for the case's own client, never "the first two capitalised words".
      if (!nameFound && c.clientName) {
        const idx = pageText.toLowerCase().indexOf(c.clientName.toLowerCase());
        if (idx >= 0) {
          nameFound = true;
          push(d, page, "Client Name", c.clientName, 96, snippetAround(pageText, idx, c.clientName.length), "identity");
        }
      }

      DATE_RE.lastIndex = 0;
      let dm: RegExpExecArray | null;
      let di = 0;
      while ((dm = DATE_RE.exec(pageText)) && di < MAX_PER_PAGE) {
        const label = dateLabel(pageText.slice(Math.max(0, dm.index - 40), dm.index));
        push(d, page, label, dm[1], 93, snippetAround(pageText, dm.index, dm[1].length), "date");
        di++;
      }

      MONEY_RE.lastIndex = 0;
      let mm: RegExpExecArray | null;
      let mi = 0;
      while ((mm = MONEY_RE.exec(pageText)) && mi < MAX_PER_PAGE) {
        const value = parseFloat(mm[1].replace(/,/g, ""));
        const unit = mm[2];
        let label = amountLabel(pageText.slice(Math.max(0, mm.index - 40), mm.index));
        if (unit && /^(hour|hr)$/i.test(unit)) label = "Hourly Rate";
        const unitShown = unit ? "/" + unit.toLowerCase().replace(/^mo$/, "month").replace(/^yr$/, "year") : "";
        const created = push(d, page, label, `$${mm[1]}${unitShown}`, label === "Amount" ? 85 : 92, snippetAround(pageText, mm.index, mm[0].length), "financial");
        if (label === "Income") {
          const annual = annualise(value, unit);
          if (annual !== null) incomes.push({ annual, ex: created });
        }
        if (label === "Rent" && value > 0) rents.push({ value, ex: created });
        mi++;
      }
    });
  }

  if (docs.length && !nameFound) {
    uncertainties.push(`The client name "${c.clientName}" does not appear in any document — confirm these documents belong to this client.`);
  }

  // Contradictions: only compare like with like, and every side must be
  // traceable to its own document, page and snippet.
  const toEvidence = (ex: Extraction): ContradictionEvidence => ({
    value: ex.fieldValue, doc: ex.sourceDoc, page: ex.sourcePage,
    snippet: ex.sourceSnippet, documentId: ex.documentId, verified: true,
  });
  const contradictions: ContradictionItem[] = [];
  const annualValues = [...new Set(incomes.map((i) => i.annual))];
  if (annualValues.length >= 2) {
    const lo = Math.min(...annualValues), hi = Math.max(...annualValues);
    if ((hi - lo) / hi > 0.05) {
      const a = incomes.find((i) => i.annual === lo)!, b = incomes.find((i) => i.annual === hi)!;
      contradictions.push({
        field: "Annual income",
        description: `Income figures conflict: ${money(lo)}/year (${a.ex.sourceDoc}) vs ${money(hi)}/year (${b.ex.sourceDoc}). Confirm which figure is current — documents may reflect different dates.`,
        evidence: [toEvidence(a.ex), toEvidence(b.ex)],
      });
    }
  }
  const rentValues = [...new Set(rents.map((r) => r.value))];
  if (rentValues.length >= 2) {
    const sides = rentValues.map((v) => rents.find((r) => r.value === v)!.ex);
    contradictions.push({
      field: "Monthly rent",
      description: `Different rent amounts appear across documents: ${sides.map((ex) => `${money(parseFloat(ex.fieldValue.replace(/[^0-9.]/g, "")))} (${ex.sourceDoc})`).join(", ")}. Confirm the current rent.`,
      evidence: sides.map(toEvidence),
    });
  }
  // Locates the first page containing the pattern, for timeline contradictions.
  const findMention = (re: RegExp): ContradictionEvidence | null => {
    for (const d of docs) {
      const pages = (d.extractedText || "").split("\f");
      for (let i = 0; i < pages.length; i++) {
        const m = re.exec(pages[i]);
        if (m) return { value: m[0], doc: d.name, page: i + 1, snippet: snippetAround(pages[i], m.index, m[0].length), documentId: d.id, verified: true };
      }
    }
    return null;
  };
  const eliminated = findMention(/position (was |has been )?eliminat(?:ed|ion)/i);
  const refilled = findMention(/refilled/i);
  if (eliminated && refilled) {
    contradictions.push({
      field: "Termination reason",
      description: "Termination reason ('position elimination') conflicts with evidence the position was refilled shortly after. Requires human investigation.",
      evidence: [eliminated, refilled],
    });
  }

  const checklist = checkRequiredDocs(c.caseType, docs);
  const missing = checklist.missing;
  const required = checklist.items.length;
  const deadlines = extractions.filter((e) => e.fieldName === "Deadline");

  // Evidence: most decision-relevant facts first.
  const PRIORITY: Record<string, number> = { Deadline: 0, Arrears: 1, Income: 2, Rent: 3, "Effective Date": 4, "Event Date": 5, Bill: 6, Debt: 7, "Client Name": 8 };
  const evidence: Evidence[] = [...extractions]
    .filter((e) => e.fieldName !== "Date of Birth")
    .sort((a, b) => (PRIORITY[a.fieldName] ?? 20) - (PRIORITY[b.fieldName] ?? 20))
    .slice(0, 5)
    .map((e) => ({ claim: `${e.fieldName}: ${e.fieldValue}`, doc: e.sourceDoc, page: e.sourcePage, snippet: e.sourceSnippet, verified: true }));

  let title: string, summary: string, reasoning: string, confidence: number;
  const nextSteps: string[] = [];
  if (missing.length >= 3) {
    title = "Recommend: Request Missing Documents Before Proceeding";
    summary = `Do not proceed yet — ${missing.length} of ${required} required document(s) are missing. Acting without them risks denial.`;
    reasoning = `${required - missing.length} of ${required} required documents for ${c.caseType} are on file. Missing: ${missing.join(", ")}.`;
    confidence = 90;
    nextSteps.push(`Request from client: ${missing.join(", ")}`, "Re-run analysis after upload");
  } else if (contradictions.length > 0) {
    title = "Recommend: Investigate Contradictions Before Filing";
    summary = "Material inconsistencies were detected across documents. Reconcile them with the client before taking action.";
    reasoning = contradictions.map((x) => x.description).join(" ") + ` ${extractions.length} facts extracted from ${docs.length} document(s).` + (missing.length ? ` Also missing: ${missing.join(", ")}.` : "");
    confidence = 74;
    nextSteps.push("Review each contradiction with the client and the source documents");
    if (missing.length) nextSteps.push(`Request: ${missing.join(", ")}`);
  } else if (missing.length > 0) {
    title = "Recommend: Obtain Remaining Documents Before Filing";
    summary = `${missing.length} required document(s) still missing: ${missing.join(", ")}. No contradictions were found in the documents on file.`;
    reasoning = `${required - missing.length} of ${required} required documents for ${c.caseType} are on file and consistent. ${extractions.length} facts extracted with source references.`;
    confidence = 80;
    nextSteps.push(`Request: ${missing.join(", ")}`, "Re-run analysis after upload");
  } else {
    title = "Recommend: Proceed — Evidence Is Complete and Consistent";
    summary = "All required documents are present and no contradictions were detected. Evidence supports proceeding to the next step.";
    reasoning = `${docs.length} document(s) reviewed; ${extractions.length} facts extracted with source references. All ${required} required documents present; no contradictions detected.`;
    confidence = 86;
    nextSteps.push("Human reviewer to verify facts against originals and approve", "Record decision in audit trail");
  }
  if (deadlines.length) nextSteps.push(`Calendar deadline: ${deadlines.map((d) => d.fieldValue).join(", ")}`);

  const rec: Recommendation = {
    id: uid(), caseId: c.id, title, summary, reasoning, confidence,
    status: "pending", evidence, missingInfo: missing, contradictions,
    uncertainties: [
      ...uncertainties,
      "Demo Mode: confidence is an uncalibrated heuristic score, NOT a verified probability.",
      "Automated extraction may miss handwritten or scanned content — verify against originals.",
    ],
    nextSteps, engine: "demo",
    createdAt: new Date().toISOString(),
  };
  const summaryText = `Analyzed ${docs.length} document(s) for ${c.clientName} (${c.caseType}). Extracted ${extractions.length} facts. ${missing.length} missing item(s), ${contradictions.length} contradiction(s). Completeness ${checklist.completeness}%.`;
  return {
    extractions, recommendation: rec, contradictions, missing,
    completeness: checklist.completeness,
    suggestedStatus: suggestStatus(missing.length, contradictions.length),
    summary: summaryText,
  };
}

export const EVALUATION = {
  label: "Illustrative demo measurements — replace with real testing results",
  metrics: [
    { name: "Manual review time (per case)", manual: 95, ai: 22, unit: "min", note: "AI-assisted = human verify + approve" },
    { name: "Extraction accuracy", manual: 88, ai: 91, unit: "%", note: "Field-level match on demo set" },
    { name: "Missing-info detection", manual: 72, ai: 96, unit: "%", note: "Recall on required-doc checklist" },
    { name: "Evidence coverage", manual: 64, ai: 89, unit: "%", note: "% of claims with source citation" },
  ],
};

export const DRIVE_FILES = [
  { name: "Gonzalez_Lease_2026.pdf", size: "284 KB", modified: "Apr 28, 2026", shared: true },
  { name: "Carter_PayStub_Apr.pdf", size: "96 KB", modified: "May 3, 2026", shared: true },
  { name: "Thompson_Emails_Export.pdf", size: "412 KB", modified: "Apr 21, 2026", shared: false },
  { name: "Okafor_Financial_Disclosure.pdf", size: "188 KB", modified: "May 7, 2026", shared: true },
  { name: "Hassan_Sponsorship_Letter.pdf", size: "74 KB", modified: "May 9, 2026", shared: true },
];

export function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
export function fmtDate(iso: string) { try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; } }
export function fmtTime(iso: string) { try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return iso; } }
export function fmtSize(n: number) { if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB"; if (n > 1024) return Math.round(n / 1024) + " KB"; return n + " B"; }
