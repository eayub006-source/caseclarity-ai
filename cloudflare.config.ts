import { bindings, defineConfig, defineWorker } from "cf/config";

// Cloudflare Workers deployment (built with vinext — see README "Deploying to
// Cloudflare"). The Worker only serves the app and three stateless API
// routes; all case data lives in each visitor's browser, so there are no
// KV, D1 or R2 bindings.
//
// Optional Live AI (an OpenAI-compatible LLM): uncomment the secret lines
// below, then set the values — locally in .dev.vars (copy .dev.vars.example),
// in production as Worker secrets (Cloudflare dashboard → Workers → caseclarity-ai
// → Settings → Variables and Secrets). Declared secrets are REQUIRED at deploy,
// which is why they stay commented out in Demo Mode. nodejs_compat exposes
// them on process.env, where src/lib/server-config.ts reads them.
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
      // LLM_API_KEY: bindings.secret(),
      // LLM_BASE_URL: bindings.secret(), // only if not using https://api.openai.com/v1
      // LLM_MODEL: bindings.secret(),    // only to change the default gpt-4o-mini
    },
  }),
});
