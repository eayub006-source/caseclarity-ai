import { bindings, defineConfig, defineWorker } from "cf/config";

// Cloudflare Workers deployment (built with vinext — see README "Deploying to
// Cloudflare"). The Worker serves the app and four API routes (analyze, config,
// health, summaries). Case data, documents, extracted text and accounts live in
// each visitor's browser. The one exception is the D1 database bound as DB
// (database "caseclarity-summaries"), which stores ONLY AI document summaries
// and their cited highlights, scoped to the workspace that generated them.
// Existing rows are preserved by an additive runtime migration (see
// db/schema.sql and src/lib/summaries-db.ts). If the binding is missing or
// unreachable, /api/summaries answers 503 and the app keeps summaries in the
// browser; Demo Mode never uses D1 at all.
//
// ANALYZE_LIMIT is Cloudflare's built-in Workers rate limiter. It caps Live AI
// at 10 analyses per minute per visitor IP, which protects the AI budget even
// on a workers.dev address (where dashboard WAF rules are not available).
// The namespace id is any number unique to this account.
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
      // is unavailable (for example a transient HTTP 503). This is a plain-text
      // binding, deliberately NOT a secret: a declared secret is required at
      // deploy, so making this one required broke the Cloudflare build until it
      // was set by hand. The value lives here, and a fallback result is labelled
      // in the audit trail.
      LLM_FALLBACK_MODELS: bindings.text("gemini-3.5-flash-lite"),
      ANALYZE_LIMIT: bindings.rateLimit({ namespace: "1001", simple: { limit: 10, period: 60 } }),
      // AI document summaries only. The existing database and its
      // document_summaries table are reused; the table is never recreated or
      // emptied. Every query is scoped by a hash of the visitor's workspace
      // token, so a case ID alone cannot read another visitor's summaries.
      DB: bindings.d1({ name: "caseclarity-summaries", id: "188ba1dc-644b-4648-b240-35916a55adff" }),
    },
  }),
});
