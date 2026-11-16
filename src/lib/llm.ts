// Prompt building and strict validation for LLM analysis output.
// Pure functions (no I/O) so they can be unit-tested and reused.

export interface LlmDoc { id: string; name: string; extractedText: string; }

export interface VerifiedFact {
  fieldName: string; fieldValue: string; confidence: number; category: string;
  documentId: string | null; sourceDoc: string; sourcePage: number; sourceSnippet: string; verified: boolean;
}
export interface VerifiedEvidence { claim: string; doc: string; page: number; snippet: string; verified: boolean; }
export interface VerifiedResult {
  facts: VerifiedFact[];
  contradictions: string[];
  missing: string[];
  recommendation: {
    title: string; summary: string; reasoning: string; confidence: number;
    evidence: VerifiedEvidence[]; missingInfo: string[]; uncertainties: string[]; nextSteps: string[];
  };
  unverifiedCount: number;
}

export const SYSTEM_PROMPT = `You are an assistant for a legal-aid case management tool. Extract structured facts from the provided documents and produce an explainable, evidence-backed recommendation. Documents are delimited by "=== DOCUMENT: <filename> ===" and pages by "--- PAGE <n> ---". Return ONLY valid JSON with this exact shape:
{
  "facts": [{"field": string, "value": string, "confidence": number 0-100, "sourceDoc": string, "sourcePage": number, "snippet": string, "category": "identity"|"date"|"financial"|"fact"}],
  "contradictions": [string],
  "missing": [string],
  "recommendation": {
    "title": string,
    "summary": string,
    "reasoning": string,
    "confidence": number 0-100,
    "evidence": [{"claim": string, "doc": string, "page": number, "snippet": string}],
    "missingInfo": [string],
    "uncertainties": [string],
    "nextSteps": [string]
  }
}
Rules: "sourceDoc" and "doc" must be an exact filename from a DOCUMENT header. "snippet" must be copied verbatim from that page (max 200 characters). Never present unsupported claims as facts; flag contradictions and missing information; confidence is a heuristic score, not a verified probability.`;

export const MAX_PROMPT_CHARS = 60000;

export function buildPrompt(caseInfo: { clientName: string; caseType: string; title: string }, docs: LlmDoc[], requiredDocs: string[]): string {
  let out = `CASE: ${caseInfo.title}\nCLIENT: ${caseInfo.clientName}\nCASE TYPE: ${caseInfo.caseType}\nREQUIRED DOCUMENTS FOR THIS CASE TYPE: ${requiredDocs.join(", ")}\n\n`;
  for (const d of docs) {
    out += `=== DOCUMENT: ${d.name} ===\n`;
    (d.extractedText || "").split("\f").forEach((p, i) => { out += `--- PAGE ${i + 1} ---\n${p}\n`; });
    out += "\n";
  }
  return out.length > MAX_PROMPT_CHARS ? out.slice(0, MAX_PROMPT_CHARS) + "\n[TRUNCATED]" : out;
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
};
const strList = (v: unknown, maxItems = 20) => (Array.isArray(v) ? v.map((x) => str(x, 500)).filter(Boolean).slice(0, maxItems) : []);
const CATEGORIES = new Set(["identity", "date", "financial", "fact"]);

function findDoc(docs: LlmDoc[], name: string): LlmDoc | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return docs.find((d) => d.name.toLowerCase() === n)
    || docs.find((d) => d.name.toLowerCase().replace(/\.[^.]+$/, "") === n.replace(/\.[^.]+$/, ""));
}

// Locates the snippet in the document. Returns the real 1-based page, or null.
function locate(doc: LlmDoc, snippet: string): number | null {
  const s = norm(snippet).replace(/^\.+|\.+$/g, "").replace(/\.\.\.|…/g, "");
  if (s.length < 3) return null;
  const pages = (doc.extractedText || "").split("\f").map(norm);
  for (let i = 0; i < pages.length; i++) if (pages[i].includes(s)) return i + 1;
  // Allow a shortened quote: the first 40 characters must still match verbatim.
  const head = s.slice(0, 40);
  if (head.length >= 12) for (let i = 0; i < pages.length; i++) if (pages[i].includes(head)) return i + 1;
  return null;
}

function verifyCitation(docs: LlmDoc[], docName: string, snippet: string, claimedPage: number) {
  const doc = findDoc(docs, docName);
  if (!doc) return { doc: undefined, page: claimedPage, verified: false };
  const page = locate(doc, snippet);
  return { doc, page: page ?? claimedPage, verified: page !== null };
}

// Validates and verifies raw model output. Throws if the shape is unusable.
export function validateLlmResult(raw: unknown, docs: LlmDoc[]): VerifiedResult {
  if (!raw || typeof raw !== "object") throw new Error("LLM output is not a JSON object");
  const r = raw as Record<string, unknown>;
  const rec = r.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== "object") throw new Error("LLM output has no recommendation");
  const title = str(rec.title, 200), summary = str(rec.summary), reasoning = str(rec.reasoning, 4000);
  if (!title || !summary) throw new Error("LLM recommendation is missing a title or summary");

  let unverifiedCount = 0;
  const facts: VerifiedFact[] = (Array.isArray(r.facts) ? r.facts : []).slice(0, 100).flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const fieldName = str(o.field, 120), fieldValue = str(o.value, 500);
    if (!fieldName || !fieldValue) return [];
    const snippet = str(o.snippet, 300);
    const c = verifyCitation(docs, str(o.sourceDoc, 300), snippet, num(o.sourcePage, 1, 10000, 1));
    if (!c.verified) unverifiedCount++;
    const category = str(o.category, 30).toLowerCase();
    return [{
      fieldName, fieldValue,
      // An unverified citation can never look high-confidence.
      confidence: c.verified ? num(o.confidence, 0, 100, 70) : Math.min(40, num(o.confidence, 0, 100, 40)),
      category: CATEGORIES.has(category) ? category : "fact",
      documentId: c.doc?.id ?? null,
      sourceDoc: c.doc?.name ?? (str(o.sourceDoc, 300) || "unknown document"),
      sourcePage: c.page,
      sourceSnippet: snippet,
      verified: c.verified,
    }];
  });

  const evidence: VerifiedEvidence[] = (Array.isArray(rec.evidence) ? rec.evidence : []).slice(0, 20).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const o = e as Record<string, unknown>;
    const claim = str(o.claim, 500);
    if (!claim) return [];
    const snippet = str(o.snippet, 300);
    const c = verifyCitation(docs, str(o.doc, 300), snippet, num(o.page, 1, 10000, 1));
    if (!c.verified) unverifiedCount++;
    return [{ claim, doc: c.doc?.name ?? (str(o.doc, 300) || "unknown document"), page: c.page, snippet, verified: c.verified }];
  });

  const uncertainties = strList(rec.uncertainties);
  if (unverifiedCount > 0) {
    uncertainties.unshift(`${unverifiedCount} AI citation(s) could not be matched to the uploaded documents and are marked "Unverified" — check them against the originals.`);
  }

  return {
    facts,
    contradictions: strList(r.contradictions),
    missing: strList(r.missing),
    recommendation: {
      title, summary, reasoning,
      confidence: num(rec.confidence, 0, 100, 70),
      evidence,
      missingInfo: strList(rec.missingInfo),
      uncertainties,
      nextSteps: strList(rec.nextSteps),
    },
    unverifiedCount,
  };
}
