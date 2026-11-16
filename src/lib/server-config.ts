// Server-only configuration flags. Read process.env only here and in route handlers.

export const DEFAULT_ORG = "Northside Legal Aid";

// The demo account (demo@caseclarity.ai / demo1234) and the fictional seed data.
// - DEMO_ACCOUNT=true   -> always enabled (use this for the judges' deployment)
// - DEMO_ACCOUNT=false  -> always disabled
// - unset               -> enabled in development, disabled in production
export function isDemoEnabled(): boolean {
  const flag = process.env.DEMO_ACCOUNT?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return process.env.NODE_ENV !== "production";
}

export function llmConfig() {
  const apiKey = process.env.LLM_API_KEY || "";
  return {
    apiKey,
    enabled: apiKey.length > 0,
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "gpt-4o-mini",
  };
}
