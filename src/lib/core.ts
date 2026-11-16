// CaseClarity AI — Core types, demo data & explainable AI engine (Demo Mode)
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
export type Engine = "seed" | "demo" | "llm";
export interface Recommendation {
  id: string; caseId: string; title: string; summary: string; reasoning: string;
  confidence: number; status: RecStatus; evidence: Evidence[]; missingInfo: string[];
  uncertainties: string[]; nextSteps: string[]; createdAt: string; reviewedBy?: string; reviewComment?: string;
  engine?: Engine; contradictions?: string[];
}
export interface AuditEntry {
  id: string; caseId: string | null; actor: string; action: string; details: string;
  category: string; timestamp: string;
}
export interface User { id?: string; name: string; email: string; role: string; roleLabel: string; org: string; }
export interface AppConfig { aiMode: "llm" | "demo"; model: string | null; demoAccount: boolean; }

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

export function seedCases(): CaseItem[] {
  const docs = seedDocs();
  return ([
    { id: "c1", caseNumber: "CC-2026-001", title: "Eviction Defense — 14-Day Notice Response", clientName: "Maria Gonzalez", caseType: "Housing / Eviction", status: "awaiting_review", priority: "high", description: "Client received a 14-day eviction notice after falling behind on rent due to a medical emergency. Complete documentation on file.", assignedTo: "Alex Rivera", createdAt: "2026-04-28T09:00:00Z", updatedAt: "2026-05-10T14:20:00Z", completeness: 100 },
    { id: "c2", caseNumber: "CC-2026-002", title: "SNAP Benefits Appeal — Denial Review", clientName: "James Carter", caseType: "Benefits Appeal", status: "missing_docs", priority: "urgent", description: "SNAP benefits denied for 'insufficient income verification'. Only the denial letter is on file. Income proof, ID, and household composition are missing.", assignedTo: "Priya Nair", createdAt: "2026-05-02T11:30:00Z", updatedAt: "2026-05-09T16:45:00Z", completeness: 20 },
    { id: "c3", caseNumber: "CC-2026-003", title: "Wrongful Termination — Discrimination Claim", clientName: "Aisha Thompson", caseType: "Employment", status: "flagged", priority: "high", description: "Client alleges termination after requesting pregnancy-related accommodations. Documents contain contradictory dates and income figures that must be reconciled.", assignedTo: "Alex Rivera", createdAt: "2026-04-20T08:15:00Z", updatedAt: "2026-05-11T10:05:00Z", completeness: 72 },
    { id: "c4", caseNumber: "CC-2026-004", title: "Custody Modification — Changed Circumstances", clientName: "David Okafor", caseType: "Family Law", status: "in_progress", priority: "medium", description: "Father seeks custody modification citing relocation and improved housing stability. Financial disclosure pending.", assignedTo: "Jordan Lee", createdAt: "2026-05-05T13:00:00Z", updatedAt: "2026-05-11T09:30:00Z", completeness: 60 },
    { id: "c5", caseNumber: "CC-2026-005", title: "Debt Collection Defense — Validation Request", clientName: "Rosa Delgado", caseType: "Consumer Debt", status: "completed", priority: "low", description: "Creditor validation letter drafted and sent. Case closed after creditor failed to validate debt within 30 days.", assignedTo: "Priya Nair", createdAt: "2026-03-18T10:00:00Z", updatedAt: "2026-05-06T15:00:00Z", completeness: 100 },
    { id: "c6", caseNumber: "CC-2026-006", title: "Asylum Support Letter — Credible Fear", clientName: "Yusuf Hassan", caseType: "Immigration", status: "awaiting_review", priority: "urgent", description: "Support letter for credible fear interview. Passport and residence proof on file; sponsorship letter outstanding.", assignedTo: "Jordan Lee", createdAt: "2026-05-08T07:45:00Z", updatedAt: "2026-05-11T11:15:00Z", completeness: 55 },
  ] as CaseItem[]).map((c) => ({ ...c, completeness: checkRequiredDocs(c.caseType, docs.filter((d) => d.caseId === c.id)).completeness }));
}

export function seedDocs(): DocItem[] {
  return [
    { id: "d1", caseId: "c1", name: "Lease_Agreement_Gonzalez.pdf", type: "PDF", size: 284000, status: "processed", pageCount: 6, uploadedAt: "2026-04-28T09:10:00Z", source: "Upload", extractedText: "LEASE AGREEMENT between Sunset Properties LLC and Maria Gonzalez. Premises: 412 Elm Street, Apt 3B. Monthly rent $1,450. Lease term: Jan 1, 2026 to Dec 31, 2026. Tenant: Maria Gonzalez, DOB 03/14/1989. Guarantor: none." },
    { id: "d2", caseId: "c1", name: "Eviction_Notice_14Day.pdf", type: "PDF", size: 96000, status: "processed", pageCount: 2, uploadedAt: "2026-04-28T09:12:00Z", source: "Upload", extractedText: "NOTICE TO VACATE — 14 DAYS. Dated April 25, 2026. Tenant Maria Gonzalez is in arrears $2,900 (2 months). Landlord Sunset Properties LLC demands payment or vacatur by May 9, 2026." },
    { id: "d3", caseId: "c1", name: "Pay_Stubs_Mar2026.pdf", type: "PDF", size: 142000, status: "processed", pageCount: 3, uploadedAt: "2026-04-29T10:00:00Z", source: "Upload", extractedText: "PAY STUB — Maria Gonzalez. Employer: BrightMart Retail. Gross pay $3,200/month. Net $2,610. Pay period March 2026. Hourly rate $18.50." },
    { id: "d4", caseId: "c1", name: "Medical_Bill_Emergency.pdf", type: "PDF", size: 118000, status: "processed", pageCount: 2, uploadedAt: "2026-04-29T10:05:00Z", source: "Upload", extractedText: "EMERGENCY ROOM BILL — Maria Gonzalez. Date of service March 8, 2026. Total $4,750. Diagnosis: appendicitis. Patient missed 3 weeks of work." },
    { id: "d5", caseId: "c1", name: "Rent_Payment_History.csv", type: "CSV", size: 12000, status: "processed", pageCount: 1, uploadedAt: "2026-04-30T08:00:00Z", source: "Upload", extractedText: "Rent payment history: Jan 2026 paid $1,450 on time. Feb 2026 paid $1,450 on time. Mar 2026: $0 (medical emergency). Apr 2026: $0. Total arrears $2,900." },
    { id: "d6", caseId: "c2", name: "SNAP_Denial_Letter.pdf", type: "PDF", size: 88000, status: "processed", pageCount: 2, uploadedAt: "2026-05-02T11:40:00Z", source: "Upload", extractedText: "NOTICE OF DENIAL — SNAP Benefits. Applicant: James Carter. Date: April 28, 2026. Reason: 'Failure to provide income verification.' Appeal deadline: May 28, 2026 (30 days)." },
    { id: "d7", caseId: "c3", name: "Termination_Letter_Thompson.pdf", type: "PDF", size: 102000, status: "processed", pageCount: 2, uploadedAt: "2026-04-20T08:30:00Z", source: "Upload", extractedText: "TERMINATION LETTER — Aisha Thompson. Effective date: April 10, 2026. Reason stated: 'Position elimination.' Final salary $62,000/year. Last day: April 10, 2026." },
    { id: "d8", caseId: "c3", name: "Pay_Stub_Thompson_Mar.pdf", type: "PDF", size: 98000, status: "processed", pageCount: 2, uploadedAt: "2026-04-20T08:32:00Z", source: "Upload", extractedText: "PAY STUB — Aisha Thompson. Employer: Meridian Logistics. Gross $5,800/month ($69,600/year). Pay period March 2026. Note: salary differs from termination letter figure of $62,000." },
    { id: "d9", caseId: "c3", name: "Accommodation_Request_Email.txt", type: "TXT", size: 8000, status: "processed", pageCount: 1, uploadedAt: "2026-04-21T09:00:00Z", source: "Upload", extractedText: "Email from Aisha Thompson to HR, dated February 18, 2026: 'I am requesting reasonable accommodation for pregnancy-related medical appointments.' HR reply dated February 20, 2026 acknowledges receipt. Termination letter dated April 10, 2026 states position elimination — but HR records show position was refilled April 15, 2026." },
    { id: "d10", caseId: "c3", name: "Performance_Review_2025.pdf", type: "PDF", size: 156000, status: "processed", pageCount: 4, uploadedAt: "2026-04-22T10:00:00Z", source: "Upload", extractedText: "PERFORMANCE REVIEW — Aisha Thompson, 2025. Rating: Exceeds Expectations. No disciplinary actions. Salary $62,000 at time of review (Jan 2025). Raise to $69,600 effective Jan 2026 per HR memo." },
    { id: "d11", caseId: "c4", name: "Current_Custody_Order.pdf", type: "PDF", size: 134000, status: "processed", pageCount: 5, uploadedAt: "2026-05-05T13:10:00Z", source: "Upload", extractedText: "CUSTODY ORDER — Okafor v. Okafor. Mother primary custodian. Father visitation alternate weekends. Order dated June 12, 2024." },
    { id: "d12", caseId: "c4", name: "Housing_Proof_Okafor.pdf", type: "PDF", size: 76000, status: "processed", pageCount: 2, uploadedAt: "2026-05-06T09:00:00Z", source: "Upload", extractedText: "New lease for David Okafor, 88 Oak Avenue, 3-bedroom, effective March 1, 2026. Rent $1,800/month. Landlord: Oak Properties." },
    { id: "d13", caseId: "c5", name: "Debt_Validation_Letter.pdf", type: "PDF", size: 92000, status: "processed", pageCount: 3, uploadedAt: "2026-03-18T10:10:00Z", source: "Upload", extractedText: "Debt validation request sent to Apex Collections on March 18, 2026, on behalf of Rosa Delgado. Amount disputed: $3,200. No response received within 30 days." },
    { id: "d14", caseId: "c6", name: "Passport_Hassan.pdf", type: "PDF", size: 110000, status: "processed", pageCount: 2, uploadedAt: "2026-05-08T08:00:00Z", source: "Upload", extractedText: "Passport — Yusuf Hassan. Issued 2021, expires 2026. Nationality: Sudan. Entry date: March 15, 2026." },
    { id: "d15", caseId: "c6", name: "Residence_Proof_Hassan.pdf", type: "PDF", size: 64000, status: "processed", pageCount: 1, uploadedAt: "2026-05-08T08:05:00Z", source: "Upload", extractedText: "Utility bill for Yusuf Hassan, 220 Pine St, dated April 2026. Confirms current residence." },
    { id: "d16", caseId: "c1", name: "Drivers_License_Gonzalez.pdf", type: "PDF", size: 54000, status: "processed", pageCount: 1, uploadedAt: "2026-04-28T09:05:00Z", source: "Upload", extractedText: "STATE DRIVER'S LICENSE. Name: Maria Gonzalez. DOB 03/14/1989. Address: 412 Elm Street, Apt 3B. Expires 2029." },
    { id: "d17", caseId: "c5", name: "State_ID_Delgado.pdf", type: "PDF", size: 51000, status: "processed", pageCount: 1, uploadedAt: "2026-03-18T10:02:00Z", source: "Upload", extractedText: "STATE ID CARD. Name: Rosa Delgado. DOB 07/22/1975. Expires 2030." },
    { id: "d18", caseId: "c5", name: "Apex_Account_Statement.pdf", type: "PDF", size: 73000, status: "processed", pageCount: 1, uploadedAt: "2026-03-18T10:04:00Z", source: "Upload", extractedText: "Account statement from Apex Collections for Rosa Delgado. Amount claimed $3,200. Original creditor not identified." },
    { id: "d19", caseId: "c5", name: "Income_Letter_Delgado.pdf", type: "PDF", size: 40000, status: "processed", pageCount: 1, uploadedAt: "2026-03-18T10:06:00Z", source: "Upload", extractedText: "Employer income letter for Rosa Delgado confirming monthly income of $2,100." },
  ];
}

export function seedExtractions(): Extraction[] {
  const E = (id: string, caseId: string, documentId: string, fieldName: string, fieldValue: string, confidence: number, sourceDoc: string, sourcePage: number, sourceSnippet: string, category: string): Extraction => ({ id, caseId, documentId, fieldName, fieldValue, confidence, sourceDoc, sourcePage, sourceSnippet, category });
  return [
    E("e1", "c1", "d1", "Client Name", "Maria Gonzalez", 98, "Lease_Agreement_Gonzalez.pdf", 1, "Tenant: Maria Gonzalez, DOB 03/14/1989", "identity"),
    E("e2", "c1", "d1", "Monthly Rent", "$1,450", 96, "Lease_Agreement_Gonzalez.pdf", 1, "Monthly rent $1,450", "financial"),
    E("e3", "c1", "d2", "Arrears Amount", "$2,900 (2 months)", 97, "Eviction_Notice_14Day.pdf", 1, "Tenant is in arrears $2,900 (2 months)", "financial"),
    E("e4", "c1", "d2", "Eviction Deadline", "May 9, 2026", 95, "Eviction_Notice_14Day.pdf", 1, "demands payment or vacatur by May 9, 2026", "date"),
    E("e5", "c1", "d3", "Monthly Income (Gross)", "$3,200", 94, "Pay_Stubs_Mar2026.pdf", 1, "Gross pay $3,200/month", "financial"),
    E("e6", "c1", "d4", "Medical Emergency Date", "March 8, 2026", 93, "Medical_Bill_Emergency.pdf", 1, "Date of service March 8, 2026", "date"),
    E("e7", "c1", "d4", "Medical Bill Total", "$4,750", 92, "Medical_Bill_Emergency.pdf", 1, "Total $4,750", "financial"),
    E("e8", "c2", "d6", "Applicant Name", "James Carter", 97, "SNAP_Denial_Letter.pdf", 1, "Applicant: James Carter", "identity"),
    E("e9", "c2", "d6", "Denial Date", "April 28, 2026", 96, "SNAP_Denial_Letter.pdf", 1, "Date: April 28, 2026", "date"),
    E("e10", "c2", "d6", "Appeal Deadline", "May 28, 2026", 95, "SNAP_Denial_Letter.pdf", 2, "Appeal deadline: May 28, 2026 (30 days)", "date"),
    E("e11", "c2", "d6", "Denial Reason", "Failure to provide income verification", 94, "SNAP_Denial_Letter.pdf", 1, "Reason: 'Failure to provide income verification'", "fact"),
    E("e12", "c3", "d7", "Termination Date", "April 10, 2026", 96, "Termination_Letter_Thompson.pdf", 1, "Effective date: April 10, 2026", "date"),
    E("e13", "c3", "d7", "Stated Salary (Termination Letter)", "$62,000/year", 90, "Termination_Letter_Thompson.pdf", 1, "Final salary $62,000/year", "financial"),
    E("e14", "c3", "d8", "Actual Salary (Pay Stub)", "$69,600/year ($5,800/mo)", 93, "Pay_Stub_Thompson_Mar.pdf", 1, "Gross $5,800/month ($69,600/year)", "financial"),
    E("e15", "c3", "d9", "Accommodation Request Date", "February 18, 2026", 95, "Accommodation_Request_Email.txt", 1, "dated February 18, 2026", "date"),
    E("e16", "c3", "d9", "Position Refill Date", "April 15, 2026", 88, "Accommodation_Request_Email.txt", 1, "position was refilled April 15, 2026", "fact"),
    E("e17", "c4", "d11", "Custody Order Date", "June 12, 2024", 95, "Current_Custody_Order.pdf", 1, "Order dated June 12, 2024", "date"),
    E("e18", "c4", "d12", "New Housing", "88 Oak Avenue, 3-bed, $1,800/mo", 94, "Housing_Proof_Okafor.pdf", 1, "88 Oak Avenue, 3-bedroom", "fact"),
    E("e19", "c6", "d14", "Client Name", "Yusuf Hassan", 97, "Passport_Hassan.pdf", 1, "Yusuf Hassan", "identity"),
    E("e20", "c6", "d14", "Entry Date", "March 15, 2026", 93, "Passport_Hassan.pdf", 1, "Entry date: March 15, 2026", "date"),
  ];
}

export function seedRecommendations(): Recommendation[] {
  return [
    { id: "r1", caseId: "c1", title: "Recommend: File Emergency Stay + Payment Plan Proposal", summary: "Evidence supports an emergency stay request and a structured payment plan. All required documents are present and consistent.", reasoning: "The eviction notice (Apr 25) demands $2,900 by May 9. Payment history shows 2 months on-time payment before a documented medical emergency on Mar 8 ($4,750 bill, 3 weeks missed work). Income ($3,200/mo gross) covers rent ($1,450) going forward. No contradictions detected across 5 documents.", confidence: 88, status: "pending", evidence: [
      { claim: "Arrears of $2,900 for 2 months", doc: "Eviction_Notice_14Day.pdf", page: 1, snippet: "Tenant is in arrears $2,900 (2 months)" },
      { claim: "Medical emergency Mar 8 caused missed work", doc: "Medical_Bill_Emergency.pdf", page: 1, snippet: "Date of service March 8, 2026... missed 3 weeks of work" },
      { claim: "Income covers rent going forward", doc: "Pay_Stubs_Mar2026.pdf", page: 1, snippet: "Gross pay $3,200/month" },
      { claim: "Prior on-time payment history", doc: "Rent_Payment_History.csv", page: 1, snippet: "Jan 2026 paid $1,450 on time. Feb 2026 paid $1,450 on time" },
    ], missingInfo: [], uncertainties: ["Whether landlord will accept a payment plan is unknown — depends on negotiation.", "Court discretion on emergency stay varies by jurisdiction; verify local rules."], nextSteps: ["Draft emergency stay motion citing medical emergency", "Propose 4-month payment plan ($725/mo + current rent)", "Schedule client meeting to confirm hardship declaration"], createdAt: "2026-05-10T14:20:00Z" },
    { id: "r2", caseId: "c2", title: "Recommend: Request Documents Before Filing Appeal", summary: "Do NOT file the appeal yet. The case file is missing the core evidence the denial was based on. Gather income verification first.", reasoning: "Only 1 of 5 required documents is present (denial letter). The denial reason is 'failure to provide income verification' — filing without that evidence risks a second denial. Appeal deadline is May 28, 2026, leaving ~17 days to collect documents.", confidence: 92, status: "pending", evidence: [
      { claim: "Denial reason is missing income verification", doc: "SNAP_Denial_Letter.pdf", page: 1, snippet: "Reason: 'Failure to provide income verification'" },
      { claim: "Appeal deadline May 28, 2026", doc: "SNAP_Denial_Letter.pdf", page: 2, snippet: "Appeal deadline: May 28, 2026 (30 days)" },
    ], missingInfo: ["Proof of Income (pay stubs / employer letter)", "Government ID", "Household Composition", "Medical Evidence (if applicable)"], uncertainties: ["Client's actual income level is unknown — eligibility cannot be assessed.", "Household size affects benefit calculation and is not documented."], nextSteps: ["Contact client within 24h to request pay stubs + ID", "Request employer income letter if pay stubs unavailable", "Calendar May 28 deadline with 7-day reminder"], createdAt: "2026-05-09T16:45:00Z" },
    { id: "r3", caseId: "c3", title: "Recommend: Investigate Contradictions Before Filing", summary: "Two material contradictions must be reconciled before any filing. The timeline evidence is promising but the salary discrepancy needs explanation.", reasoning: "Accommodation request (Feb 18) precedes termination (Apr 10) by ~7 weeks, and the 'eliminated' position was refilled Apr 15 — consistent with a retaliation theory. However, salary figures conflict: $62,000 (termination letter, matching 2025 review) vs $69,600 (Mar 2026 pay stub, matching Jan 2026 raise memo). The raise memo explains the gap, but the termination letter appears to use a stale figure.", confidence: 74, status: "pending", evidence: [
      { claim: "Accommodation requested Feb 18, 2026", doc: "Accommodation_Request_Email.txt", page: 1, snippet: "dated February 18, 2026" },
      { claim: "Termination Apr 10, 2026 for 'position elimination'", doc: "Termination_Letter_Thompson.pdf", page: 1, snippet: "Effective date: April 10, 2026. Reason: 'Position elimination'" },
      { claim: "Position refilled Apr 15, 2026", doc: "Accommodation_Request_Email.txt", page: 1, snippet: "position was refilled April 15, 2026" },
      { claim: "Salary conflict: $62,000 vs $69,600", doc: "Pay_Stub_Thompson_Mar.pdf", page: 1, snippet: "Gross $5,800/month ($69,600/year)" },
    ], contradictions: ["Income figures conflict: $62,000/year (Termination_Letter_Thompson.pdf) vs $69,600/year (Pay_Stub_Thompson_Mar.pdf).", "Termination reason ('position elimination') conflicts with evidence the position was refilled April 15, 2026."], missingInfo: ["HR raise memo confirming Jan 2026 salary increase", "Job posting for refilled position"], uncertainties: ["Whether the salary gap is a clerical error or intentional misstatement is unclear.", "Employer may claim an independent reason for termination not in the file."], nextSteps: ["Request HR raise memo from client", "Preserve email headers for accommodation request", "Consult employment attorney before filing deadline"], createdAt: "2026-05-11T10:05:00Z" },
    { id: "r4", caseId: "c4", title: "Recommend: Draft Modification Petition After Financial Disclosure", summary: "Housing improvement is documented, but the financial disclosure is still missing. Complete that before filing.", reasoning: "New 3-bedroom housing (Mar 2026) supports changed-circumstances argument vs 2024 order. Financial disclosure is required for modification petitions in this jurisdiction and is not yet on file.", confidence: 71, status: "pending", evidence: [
      { claim: "Current order dates to June 2024", doc: "Current_Custody_Order.pdf", page: 1, snippet: "Order dated June 12, 2024" },
      { claim: "New 3-bedroom housing since Mar 2026", doc: "Housing_Proof_Okafor.pdf", page: 1, snippet: "88 Oak Avenue, 3-bedroom, effective March 1, 2026" },
    ], missingInfo: ["Financial Disclosure", "Government ID", "Birth Certificates"], uncertainties: ["Other parent's response to modification is unknown.", "Court may require mediation first."], nextSteps: ["Send financial disclosure worksheet to client", "Verify ID and birth certificates"], createdAt: "2026-05-11T09:30:00Z" },
    { id: "r5", caseId: "c5", title: "Case Closed — Creditor Failed to Validate", summary: "Validation was requested Mar 18; no response within 30 days. Case completed and archived.", reasoning: "Creditor failed to provide validation within the statutory window. No further action required.", confidence: 95, status: "approved", evidence: [
      { claim: "Validation requested Mar 18, 2026", doc: "Debt_Validation_Letter.pdf", page: 1, snippet: "sent to Apex Collections on March 18, 2026" },
    ], missingInfo: [], uncertainties: [], nextSteps: ["Archive case"], createdAt: "2026-05-06T15:00:00Z", reviewedBy: "Priya Nair", reviewComment: "Confirmed no creditor response. Closing case." },
    { id: "r6", caseId: "c6", title: "Recommend: Obtain Sponsorship Letter to Complete Filing", summary: "Passport and residence proof are in. Sponsorship letter is the last required document before the support letter can be finalized.", reasoning: "Entry date Mar 15, 2026 and current residence are documented. Sponsorship letter is required for the credible-fear support package.", confidence: 79, status: "pending", evidence: [
      { claim: "Entry date Mar 15, 2026", doc: "Passport_Hassan.pdf", page: 1, snippet: "Entry date: March 15, 2026" },
      { claim: "Current residence confirmed", doc: "Residence_Proof_Hassan.pdf", page: 1, snippet: "220 Pine St, dated April 2026" },
    ], missingInfo: ["Sponsorship Letter", "Visa Documents"], uncertainties: ["Sponsor availability and willingness is not yet confirmed."], nextSteps: ["Contact sponsor to draft letter", "Verify visa entry documents"], createdAt: "2026-05-11T11:15:00Z" },
  ];
}

export function seedAudit(): AuditEntry[] {
  const A = (id: string, caseId: string | null, actor: string, action: string, details: string, category: string, timestamp: string): AuditEntry => ({ id, caseId, actor, action, details, category, timestamp });
  return [
    A("a1", "c1", "Alex Rivera", "Case created", "Case CC-2026-001 opened for Maria Gonzalez", "case", "2026-04-28T09:00:00Z"),
    A("a2", "c1", "Alex Rivera", "Document uploaded", "Lease_Agreement_Gonzalez.pdf (6 pages)", "document", "2026-04-28T09:10:00Z"),
    A("a3", "c1", "System (Demo AI)", "AI analysis completed", "7 facts extracted across 5 documents; 0 contradictions", "ai", "2026-04-28T09:11:00Z"),
    A("a4", "c1", "System (Demo AI)", "Recommendation generated", "Emergency stay + payment plan — confidence 88 (demo, uncalibrated)", "ai", "2026-05-10T14:20:00Z"),
    A("a5", "c2", "Priya Nair", "Case created", "Case CC-2026-002 opened for James Carter", "case", "2026-05-02T11:30:00Z"),
    A("a6", "c2", "System (Demo AI)", "Missing documents detected", "4 of 5 required documents missing", "ai", "2026-05-02T11:41:00Z"),
    A("a7", "c2", "System (Demo AI)", "Recommendation generated", "Request documents before filing — confidence 92 (demo, uncalibrated)", "ai", "2026-05-09T16:45:00Z"),
    A("a8", "c3", "Alex Rivera", "Case created", "Case CC-2026-003 opened for Aisha Thompson", "case", "2026-04-20T08:15:00Z"),
    A("a9", "c3", "System (Demo AI)", "Contradiction detected", "Salary mismatch: $62,000 vs $69,600 across 2 documents", "ai", "2026-04-22T10:05:00Z"),
    A("a10", "c3", "System (Demo AI)", "Recommendation generated", "Investigate contradictions — confidence 74 (demo, uncalibrated)", "ai", "2026-05-11T10:05:00Z"),
    A("a11", "c5", "Priya Nair", "Recommendation approved", "Case closed — creditor failed to validate", "review", "2026-05-06T15:00:00Z"),
    A("a12", "c6", "Jordan Lee", "Document uploaded", "Passport_Hassan.pdf via Google Drive (simulated)", "document", "2026-05-08T08:00:00Z"),
    A("a13", null, "Alex Rivera", "CSV export", "Exported 6 cases to CSV", "integration", "2026-05-11T12:00:00Z"),
    A("a14", null, "System", "Demo data loaded", "6 fictional cases seeded for hackathon demonstration", "system", "2026-05-11T08:00:00Z"),
  ];
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
  contradictions: string[];
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
  const incomes: { annual: number; doc: string }[] = [];
  const rents: { value: number; doc: string }[] = [];
  const uncertainties: string[] = [];
  let fullText = "";
  let nameFound = false;

  const snippetAround = (pageText: string, idx: number, len: number) =>
    pageText.slice(Math.max(0, idx - 40), idx + len + 30).replace(/\s+/g, " ").trim();
  const push = (d: DocItem, page: number, fieldName: string, fieldValue: string, confidence: number, snippet: string, category: string) =>
    extractions.push({ id: uid(), caseId: c.id, documentId: d.id, fieldName, fieldValue, confidence, sourceDoc: d.name, sourcePage: page, sourceSnippet: snippet, category, verified: true });

  for (const d of docs) {
    const pages = (d.extractedText || "").split("\f");
    fullText += "\n" + pages.join("\n");
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
        push(d, page, label, `$${mm[1]}${unitShown}`, label === "Amount" ? 85 : 92, snippetAround(pageText, mm.index, mm[0].length), "financial");
        if (label === "Income") {
          const annual = annualise(value, unit);
          if (annual !== null) incomes.push({ annual, doc: d.name });
        }
        if (label === "Rent" && value > 0) rents.push({ value, doc: d.name });
        mi++;
      }
    });
  }

  if (docs.length && !nameFound) {
    uncertainties.push(`The client name "${c.clientName}" does not appear in any document — confirm these documents belong to this client.`);
  }

  // Contradictions: only compare like with like.
  const contradictions: string[] = [];
  const annualValues = [...new Set(incomes.map((i) => i.annual))];
  if (annualValues.length >= 2) {
    const lo = Math.min(...annualValues), hi = Math.max(...annualValues);
    if ((hi - lo) / hi > 0.05) {
      const a = incomes.find((i) => i.annual === lo)!, b = incomes.find((i) => i.annual === hi)!;
      contradictions.push(`Income figures conflict: ${money(lo)}/year (${a.doc}) vs ${money(hi)}/year (${b.doc}). Confirm which figure is current — documents may reflect different dates.`);
    }
  }
  const rentValues = [...new Set(rents.map((r) => r.value))];
  if (rentValues.length >= 2) {
    contradictions.push(`Different rent amounts appear across documents: ${rents.map((r) => `${money(r.value)} (${r.doc})`).join(", ")}. Confirm the current rent.`);
  }
  if (/position elimination|position (was |has been )?eliminated/i.test(fullText) && /refilled/i.test(fullText)) {
    contradictions.push("Termination reason ('position elimination') conflicts with evidence the position was refilled shortly after. Requires human investigation.");
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
    reasoning = contradictions.join(" ") + ` ${extractions.length} facts extracted from ${docs.length} document(s).` + (missing.length ? ` Also missing: ${missing.join(", ")}.` : "");
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
