import { NextResponse } from "next/server";
import { allowAnalysis, isSameOrigin, llmConfig } from "@/lib/server-config";
import { SYSTEM_PROMPT, buildPrompt, validateLlmResult, postChatCompletion, LlmError, type LlmDoc } from "@/lib/llm";
import { REQUIRED_DOCS } from "@/lib/core";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Live AI analysis (OpenAI-compatible chat completions API). Stateless: the
// browser sends the case details and its documents' extracted text, because
// all data lives in the browser.
// - The API key is read server-side only and never exposed to the browser.
// - Document and page boundaries are marked in the prompt, and every citation
//   in the answer (facts, evidence and both sides of every contradiction) is
//   verified against the text that was sent (src/lib/llm.ts).
// - With no key configured, or on any failure, it answers mode "demo" with a
//   reason, and the browser falls back to the local demo engine (labelled).

const MAX_BODY_CHARS = 600_000; // the prompt itself is capped at MAX_PROMPT_CHARS
const MAX_DOCS = 50;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  if (Number(req.headers.get("content-length") || "0") > MAX_BODY_CHARS * 2) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  const cfg = llmConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ mode: "demo", reason: "No LLM_API_KEY configured — using the local demo engine." });
  }

  // Protects the AI budget: at most 10 Live AI analyses per minute per visitor.
  if (!(await allowAnalysis(req))) {
    return NextResponse.json(
      { error: "Too many AI analyses from your connection. Wait a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const body = await readJson(req);
  const c = (body.case && typeof body.case === "object" ? body.case : {}) as Record<string, unknown>;
  const caseInfo = { title: str(c.title, 200), clientName: str(c.clientName, 120), caseType: str(c.caseType, 80) || "Other" };
  const rawDocs = Array.isArray(body.documents) ? body.documents.slice(0, MAX_DOCS) : [];
  const docs: LlmDoc[] = [];
  let total = 0;
  for (const raw of rawDocs) {
    const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = str(d.name, 255);
    const extractedText = typeof d.extractedText === "string" ? d.extractedText : "";
    if (!name) continue;
    total += extractedText.length;
    if (total > MAX_BODY_CHARS) return NextResponse.json({ error: "Documents are too large to analyze" }, { status: 413 });
    docs.push({ id: str(d.id, 100) || name, name, extractedText });
  }
  if (!docs.length) return NextResponse.json({ error: "Upload at least one document first" }, { status: 400 });

  const prompt = buildPrompt(caseInfo, docs, REQUIRED_DOCS[caseInfo.caseType] || REQUIRED_DOCS["Other"]);

  try {
    const outcome = await postChatCompletion(
      {
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        timeoutMs: cfg.timeoutMs,
        fallbackModels: cfg.fallbackModels,
        maxAttempts: cfg.maxAttempts,
        retryBaseDelayMs: cfg.retryBaseDelayMs,
      },
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(outcome.content);
    } catch {
      return NextResponse.json({ mode: "demo", reason: "LLM returned invalid JSON — fell back to the demo engine." });
    }
    const result = validateLlmResult(parsed, docs);
    // `model` is the model that actually answered, which may be a fallback.
    // `primaryModel` is always the configured primary, so the audit trail can
    // show when a fallback stood in.
    return NextResponse.json({
      mode: "llm",
      model: outcome.model,
      primaryModel: outcome.primaryModel,
      fallbackUsed: outcome.fallbackUsed,
      attempts: outcome.attempts,
      result,
    });
  } catch (e) {
    // Provider failures (timeout, rate limit, network, HTTP error) and invalid
    // output both degrade honestly to the labelled demo engine.
    const reason = e instanceof LlmError
      ? (e.status === 429
        ? "LLM rate limit reached (HTTP 429) — fell back to the demo engine."
        : `${e.message} — fell back to the demo engine.`)
      : `LLM output rejected: ${e instanceof Error ? e.message : "unknown error"} — fell back to the demo engine.`;
    console.error("LLM analysis error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ mode: "demo", reason });
  }
}
