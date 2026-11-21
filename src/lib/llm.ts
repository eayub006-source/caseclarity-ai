// Prompt building, provider call and strict validation for LLM analysis output.
// Pure functions plus a thin fetch wrapper (no I/O of its own) so they can be
// unit-tested and reused. Nothing here reads process.env — the route passes
// the server-side config in.

export interface LlmDoc { id: string; name: string; extractedText: string; }

export interface VerifiedFact {
  fieldName: string; fieldValue: string; confidence: number; category: string;
  documentId: string | null; sourceDoc: string; sourcePage: number; sourceSnippet: string; verified: boolean;
}
export interface VerifiedEvidence { claim: string; doc: string; page: number; snippet: string; verified: boolean; }
export interface VerifiedContradictionEvidence {
  value: string; doc: string; page: number; snippet: string; documentId: string | null; verified: boolean;
}
export interface VerifiedContradiction {
  field: string; description: string; evidence: VerifiedContradictionEvidence[];
}
export interface VerifiedResult {
  facts: VerifiedFact[];
  contradictions: VerifiedContradiction[];
  missing: string[];
  recommendation: {
    title: string; summary: string; reasoning: string; confidence: number;
    evidence: VerifiedEvidence[]; missingInfo: string[]; uncertainties: string[]; nextSteps: string[];
    sufficientEvidence: boolean;
  };
  unverifiedCount: number;
}

export const SYSTEM_PROMPT = `You are an assistant for a legal-aid case management tool. You extract structured facts from the provided documents and produce an explainable, evidence-backed recommendation for a human case worker.

Documents are delimited by "=== DOCUMENT: <filename> ===" and pages by "--- PAGE <n> ---". Return ONLY valid JSON with this exact shape:
{
  "facts": [{"field": string, "value": string, "confidence": number 0-100, "sourceDoc": string, "sourcePage": number, "snippet": string, "category": "identity"|"date"|"financial"|"fact"}],
  "contradictions": [{"field": string, "description": string, "evidence": [{"value": string, "doc": string, "page": number, "snippet": string}, ...]}],
  "missing": [string],
  "recommendation": {
    "title": string, "summary": string, "reasoning": string, "confidence": number 0-100,
    "sufficientEvidence": boolean,
    "evidence": [{"claim": string, "doc": string, "page": number, "snippet": string}],
    "missingInfo": [string], "uncertainties": [string], "nextSteps": [string]
  }
}

Hard rules:
- "sourceDoc" and "doc" must be an exact filename from a DOCUMENT header. Never invent a document name.
- "snippet" must be copied verbatim from that page (max 200 characters). Never paraphrase a quote.
- Only report a fact if it is actually stated in the documents. Do not infer, assume or add outside knowledge.
- Contradictions must compare comparable things (the same kind of amount, the same date role). Each contradiction needs at least TWO evidence items, each with its own document, page and verbatim snippet. Never report a contradiction you cannot support with two citations.
- Distinguish facts (quoted from a document) from interpretation (your reasoning). Put interpretation in "reasoning", "uncertainties" and "missingInfo" — never in "facts".
- If the documents do not support a conclusion, set "sufficientEvidence" to false, keep "confidence" low, and say in the title and summary what is missing. Do not guess a way around gaps.
- List what information is missing in "missing"/"missingInfo" and what is uncertain in "uncertainties". An empty "uncertainties" is only acceptable when the documents are complete and unambiguous.
- Never invent legal rules, statutes, deadlines or case-specific facts. Never state a legal decision, order or conclusion of law: your output is advisory and a human makes every decision.
- "confidence" is a heuristic score for a human reviewer, not a verified probability.`;

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

const MAX_FACTS = 100;
const MAX_EVIDENCE = 20;
const MAX_CONTRADICTIONS = 10;

// Validates and verifies raw model output. Throws if the shape is unusable.
export function validateLlmResult(raw: unknown, docs: LlmDoc[]): VerifiedResult {
  if (!raw || typeof raw !== "object") throw new Error("LLM output is not a JSON object");
  const r = raw as Record<string, unknown>;
  const rec = r.recommendation as Record<string, unknown> | undefined;
  if (!rec || typeof rec !== "object") throw new Error("LLM output has no recommendation");
  const title = str(rec.title, 200), summary = str(rec.summary), reasoning = str(rec.reasoning, 4000);
  if (!title || !summary) throw new Error("LLM recommendation is missing a title or summary");

  let unverifiedCount = 0;
  const facts: VerifiedFact[] = (Array.isArray(r.facts) ? r.facts : []).slice(0, MAX_FACTS).flatMap((f) => {
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

  const evidence: VerifiedEvidence[] = (Array.isArray(rec.evidence) ? rec.evidence : []).slice(0, MAX_EVIDENCE).flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const o = e as Record<string, unknown>;
    const claim = str(o.claim, 500);
    if (!claim) return [];
    const snippet = str(o.snippet, 300);
    const c = verifyCitation(docs, str(o.doc, 300), snippet, num(o.page, 1, 10000, 1));
    if (!c.verified) unverifiedCount++;
    return [{ claim, doc: c.doc?.name ?? (str(o.doc, 300) || "unknown document"), page: c.page, snippet, verified: c.verified }];
  });

  // Every side of a contradiction is verified against the documents. A
  // contradiction with fewer than two traceable sides is dropped entirely —
  // it must never appear as a supported conflict.
  const contradictions: VerifiedContradiction[] = (Array.isArray(r.contradictions) ? r.contradictions : []).slice(0, MAX_CONTRADICTIONS).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    const description = str(o.description, 600);
    const rawEvidence = Array.isArray(o.evidence) ? o.evidence.slice(0, 6) : [];
    const items: VerifiedContradictionEvidence[] = [];
    for (const e of rawEvidence) {
      if (!e || typeof e !== "object") continue;
      const x = e as Record<string, unknown>;
      const value = str(x.value, 300), doc = str(x.doc, 300), snippet = str(x.snippet, 300);
      if (!value || !doc) continue;
      const v = verifyCitation(docs, doc, snippet, num(x.page, 1, 10000, 1));
      if (!v.verified) unverifiedCount++;
      items.push({
        value,
        doc: v.doc?.name ?? doc,
        page: v.page,
        snippet,
        documentId: v.doc?.id ?? null,
        verified: v.verified,
      });
    }
    if (!description || items.filter((i) => i.verified).length < 2) return [];
    return [{ field: str(o.field, 120) || "Unspecified field", description, evidence: items }];
  });

  const missingInfo = strList(rec.missingInfo);
  const uncertainties = strList(rec.uncertainties);
  const sufficientEvidence = rec.sufficientEvidence !== false;

  if (!sufficientEvidence) {
    if (!/insufficient|not enough|could not|cannot|unable/i.test(title + " " + summary)) {
      uncertainties.unshift("The AI reported insufficient evidence: the documents do not support a conclusion — treat this recommendation as incomplete.");
    }
  }
  if (evidence.length === 0) {
    uncertainties.unshift("The AI cited no supporting evidence for this recommendation — verify every claim against the original documents.");
  }
  if (unverifiedCount > 0) {
    uncertainties.unshift(`${unverifiedCount} AI citation(s) could not be matched to the uploaded documents and are marked "Unverified" — check them against the originals.`);
  }

  const confidence = sufficientEvidence
    ? num(rec.confidence, 0, 100, 70)
    : Math.min(60, num(rec.confidence, 0, 100, 40));

  return {
    facts,
    contradictions,
    missing: strList(r.missing),
    recommendation: {
      title, summary, reasoning, confidence,
      evidence,
      missingInfo: missingInfo.length ? missingInfo : strList(r.missing),
      uncertainties,
      nextSteps: strList(rec.nextSteps),
      sufficientEvidence,
    },
    unverifiedCount,
  };
}

// ---------- Provider call ----------

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** A provider failure the route can turn into an honest Demo Mode fallback. */
export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * Calls an OpenAI-compatible Chat Completions endpoint and returns the message
 * content. Throws LlmError on timeout, network failure, non-2xx status or an
 * unreadable body. `fetchImpl` is injectable so tests can simulate failures.
 */
export async function postChatCompletion(
  cfg: LlmClientConfig,
  messages: { role: string; content: string }[],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  // An explicit AbortController + timer: AbortSignal.timeout() is not
  // honoured by every fetch implementation (the Cloudflare Worker runtime
  // ignores it), and a hung provider call must never block a request forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      }),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new LlmError(timedOut ? `LLM request timed out after ${cfg.timeoutMs} ms` : `LLM network error: ${e instanceof Error ? e.message : "unknown"}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new LlmError(`LLM request failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`, res.status);
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new LlmError("LLM returned no message content");
  return content;
}
