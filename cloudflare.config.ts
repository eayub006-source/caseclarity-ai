import { bindings, defineConfig, defineWorker } from "cf/config";

// Cloudflare Workers deployment (built with vinext — see README "Deploying to
// Cloudflare"). The Worker only serves the app and three stateless API
// routes; all case data lives in each visitor's browser, so there are no
// KV, D1 or R2 bindings.
//
// Live AI (an OpenAI-compatible LLM — Google Gemini in production) is enabled
// by declaring the LLM_* bindings below as Worker secrets. The values are
// never stored in this file or in the bundle: they are supplied out of band,
// either in .dev.vars for `npm run preview:cloudflare` (copy .dev.vars.example)
// or by .github/workflows/deploy-cloudflare.yml, which copies the GitHub
// repository secrets into the Worker's secret store before deploying.
//
// A declared secret is REQUIRED at deploy time — if one is missing the deploy
// fails instead of silently running without AI. Demo Mode is unaffected: it is
// the app's built-in fallback whenever the provider call fails (bad key,
// timeout, rate limit or malformed response) and is labelled as such in the UI.
// nodejs_compat exposes the secrets on process.env, which is where
// src/lib/server-config.ts reads them.
export default defineConfig({
  worker: defineWorker({
    name: "caseclarity-ai",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-20",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      LLM_API_KEY: bindings.secret(),
      // Gemini OpenAI-compatible endpoint (Bearer auth).
      LLM_BASE_URL: bindings.secret(),
      // Verified model ID — see README / CONTEXT.md.
      LLM_MODEL: bindings.secret(),
      // Request timeout in ms (5000–300000). Must be declared here: an
      // undeclared variable silently falls back to the 90 s code default.
      LLM_TIMEOUT_MS: bindings.secret(),
      // Comma-separated fallback models, tried in order when the primary model
      // is unavailable (for example a transient HTTP 503). Optional: when it is
      // unset the code default (gemini-3.5-flash-lite) applies, so a fallback
      // is always available. A fallback result is labelled in the audit trail.
      LLM_FALLBACK_MODELS: bindings.secret(),
    },
  }),
});
