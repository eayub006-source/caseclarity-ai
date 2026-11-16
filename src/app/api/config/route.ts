import { NextResponse } from "next/server";
import { isDemoEnabled, llmConfig } from "@/lib/server-config";

export const dynamic = "force-dynamic";

// Public, non-secret runtime flags so the UI can label itself honestly:
// which analysis engine is active and whether the demo account exists.
export async function GET() {
  const llm = llmConfig();
  return NextResponse.json({
    aiMode: llm.enabled ? "llm" : "demo",
    model: llm.enabled ? llm.model : null,
    demoAccount: isDemoEnabled(),
  });
}
