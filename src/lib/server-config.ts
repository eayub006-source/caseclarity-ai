// Server-only configuration. Read process.env only here and in route handlers.
// On Cloudflare Workers these are Worker secrets, declared in
// cloudflare.config.ts and exposed on process.env by nodejs_compat.

export function llmConfig() {
  const apiKey = process.env.LLM_API_KEY || "";
  // Request timeout for the provider call, in milliseconds (5 s – 5 min).
  const timeoutMs = Math.max(5000, Math.min(300_000, Number(process.env.LLM_TIMEOUT_MS) || 90_000));
  return {
    apiKey,
    enabled: apiKey.length > 0,
    baseUrl: (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    timeoutMs,
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
