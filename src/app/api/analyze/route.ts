import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Real LLM analysis endpoint (OpenAI-compatible chat completions API).
// The API key is read server-side only (process.env.LLM_API_KEY) and never
// exposed to the browser. If no key is configured, the endpoint reports
// mode "demo" and the frontend falls back to the local demo engine — this is
// clearly labeled in the UI and audit trail.

const SYSTEM_PROMPT = `You are an assistant for a legal-aid case management tool. Extract structured facts from the provided documents and produce an explainable, evidence-backed recommendation. Return ONLY valid JSON with this exact shape:
{
  "facts": [{"field": string, "value": string, "confidence": number 0-100, "sourceDoc": string, "sourcePage": number, "snippet": string, "category": string}],
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
Rules: never present unsupported claims as facts; cite the source document and page for every fact; flag contradictions and missing information; confidence is a heuristic score, not a verified probability.`;

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text: string = body.text || "";
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      mode: "demo",
      disclaimer:
        "No LLM_API_KEY configured. The frontend will use the local demo engine. Confidence is an uncalibrated heuristic, not a verified probability.",
    });
  }

  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 60000) },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ mode: "demo", error: `LLM request failed (${res.status}): ${detail.slice(0, 300)}` });
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || "";
    const result = JSON.parse(content);
    return NextResponse.json({ mode: "llm", model, result });
  } catch (e) {
    return NextResponse.json({ mode: "demo", error: `LLM error: ${String(e)}` });
  }
}
