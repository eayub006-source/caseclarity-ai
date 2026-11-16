import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, documents } from "@/db/schema";
import { requireUser, unauthorized } from "@/lib/auth-server";
import { llmConfig } from "@/lib/server-config";
import { SYSTEM_PROMPT, buildPrompt, validateLlmResult } from "@/lib/llm";
import { REQUIRED_DOCS } from "@/lib/core";
import { badRequest, isUuid, notFound, readJson } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Real LLM analysis endpoint (OpenAI-compatible chat completions API).
// - The API key is read server-side only and never exposed to the browser.
// - The server loads the case's documents itself, marks document and page
//   boundaries in the prompt, and verifies every citation in the answer
//   against the stored text (see src/lib/llm.ts).
// - With no key configured, or on any failure, it answers mode "demo" with a
//   reason, and the browser falls back to the local demo engine (labelled).

const TIMEOUT_MS = 90_000;

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = await readJson(req);
  if (!isUuid(body.caseId)) return badRequest("A valid caseId is required");

  const cfg = llmConfig();
  if (!cfg.enabled) {
    return NextResponse.json({
      mode: "demo",
      reason: "No LLM_API_KEY configured — using the local demo engine.",
    });
  }

  const [c] = await db.select().from(cases).where(eq(cases.id, body.caseId));
  if (!c) return notFound("Case not found");
  const docs = await db.select().from(documents).where(eq(documents.caseId, c.id));
  if (!docs.length) return badRequest("Upload at least one document first");
  const llmDocs = docs.map((d) => ({ id: d.id, name: d.name, extractedText: d.extractedText || "" }));
  const prompt = buildPrompt(c, llmDocs, REQUIRED_DOCS[c.caseType] || REQUIRED_DOCS["Other"]);

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
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ mode: "demo", reason: "LLM returned invalid JSON — fell back to the demo engine." });
    }
    const result = validateLlmResult(parsed, llmDocs);
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
