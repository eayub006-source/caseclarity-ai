import { NextResponse } from "next/server";
import { isSameOrigin, llmConfig } from "@/lib/server-config";
import { SYSTEM_PROMPT, buildPrompt, validateLlmResult, type LlmDoc } from "@/lib/llm";
import { REQUIRED_DOCS } from "@/lib/core";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Live AI analysis (OpenAI-compatible chat completions API). Stateless: the
// browser sends the case details and its documents' extracted text, because
// all data lives in the browser.
// - The API key is read server-side only and never exposed to the browser.
// - Document and page boundaries are marked in the prompt, and every citation
//   in the answer is verified against the text that was sent (src/lib/llm.ts).
// - With no key configured, or on any failure, it answers mode "demo" with a
//   reason, and the browser falls back to the local demo engine (labelled).

const TIMEOUT_MS = 90_000;
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
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("LLM request failed", res.status, detail.slice(0, 500));
      return NextResponse.json({ mode: "demo", reason: `LLM request failed (HTTP ${res.status}) — fell back to the demo engine.` });
    }
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const content = data?.choices?.[0]?.message?.content || "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ mode: "demo", reason: "LLM returned invalid JSON — fell back to the demo engine." });
    }
    const result = validateLlmResult(parsed, docs);
    return NextResponse.json({ mode: "llm", model: cfg.model, result });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    console.error("LLM analysis error", e);
    return NextResponse.json({
      mode: "demo",
      reason: timedOut ? "LLM request timed out — fell back to the demo engine." : `LLM output rejected: ${e instanceof Error ? e.message : "unknown error"} — fell back to the demo engine.`,
    });
  }
}
