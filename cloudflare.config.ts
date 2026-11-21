import { bindings, defineConfig, defineWorker } from "cf/config";

// Cloudflare Workers deployment (built with vinext — see README "Deploying to
// Cloudflare"). The Worker serves the app and its API routes (analyze,
// config, health, summaries). Case data, documents and accounts live in each
// visitor's browser. The one exception is the D1 database bound as DB
// ("caseclarity-summaries"), which stores only the AI document summaries used
// by /api/summaries — create it once in the Cloudflare dashboard before
// deploying, or the deploy fails.
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
      DB: bindings.d1({ name: "caseclarity-summaries" }),
    },
  }),
});
