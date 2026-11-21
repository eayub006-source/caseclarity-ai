// Server-only configuration. Read process.env only here and in route handlers.
// On Cloudflare Workers these are Worker secrets, declared in
// cloudflare.config.ts and exposed on process.env by nodejs_compat.

// Used only when the primary model is unavailable (for example a transient
// HTTP 503 "model is currently experiencing high demand"). The primary model is
// never changed silently: a fallback result is labelled as such in the audit
// trail, and the primary is always tried first.
const DEFAULT_FALLBACK_MODELS = ["gemini-3.5-flash-lite"];

function parseModelList(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const OPENAI_BASE_URL = "https://api.openai.com/v1";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";

/** Google API keys start with "AIza"; OpenAI keys never do. */
export const isGoogleKey = (key: string) => key.startsWith("AIza");

export function llmConfig() {
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  const google = isGoogleKey(apiKey);
  // Request timeout for the provider call, in milliseconds (5 s – 5 min).
  const timeoutMs = Math.max(5000, Math.min(300_000, Number(process.env.LLM_TIMEOUT_MS) || 90_000));

  // A Google key can never work against OpenAI, so when the address is missing
  // (or still the OpenAI default copied from .env.example) use Google's
  // OpenAI-compatible endpoint. This is what caused "Incorrect API key provided"
  // 401s: the Gemini key was being sent to api.openai.com.
  const rawBaseUrl = (process.env.LLM_BASE_URL || "").trim();
  const pointsAtOpenAI = !rawBaseUrl || /(^|\/\/)api\.openai\.com/.test(rawBaseUrl);
  const baseUrl = (google && pointsAtOpenAI ? GEMINI_BASE_URL : rawBaseUrl || OPENAI_BASE_URL).replace(/\/$/, "");

  // Same idea for the model: an OpenAI model name means nothing to Google.
  const rawModel = (process.env.LLM_MODEL || "").trim();
  const model = google && (!rawModel || /^(gpt-|o\d|chatgpt)/i.test(rawModel)) ? GEMINI_DEFAULT_MODEL : rawModel || "gpt-4o-mini";
  const fallbackRaw = process.env.LLM_FALLBACK_MODELS;
  const fallbackModels = (fallbackRaw ? parseModelList(fallbackRaw) : DEFAULT_FALLBACK_MODELS).filter((m) => m !== model);
  // Bounded retries: total HTTP attempts shared across the model chain.
  const maxAttempts = Math.max(1, Math.min(5, Number(process.env.LLM_MAX_ATTEMPTS) || 3));
  const retryBaseDelayMs = Math.max(0, Math.min(30_000, Number(process.env.LLM_RETRY_BASE_DELAY_MS) || 1000));
  return {
    apiKey,
    enabled: apiKey.length > 0,
    baseUrl,
    model,
    fallbackModels,
    timeoutMs,
    maxAttempts,
    retryBaseDelayMs,
  };
}

/**
 * Blocks cross-site browser requests to the API (CSRF): the Origin header,
 * or failing that Sec-Fetch-Site, must point at this site. Requests without
 * either header (curl, server-to-server) are allowed.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      return originHost === new URL(req.url).host || originHost === req.headers.get("host");
    } catch {
      return false;
    }
  }
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}
