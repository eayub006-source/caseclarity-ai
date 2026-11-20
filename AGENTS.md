# AGENTS.md — How to Work on CaseClarity AI

> Instructions for **developers and AI coding assistants** working in this repository: architecture, tech stack, setup, coding conventions, important dependencies, and the rules for making changes without breaking existing functionality.
>
> - Full inventory of what exists (features, data model, API, limitations): [CONTEXT.md](./CONTEXT.md)
> - Product goals and the problem being solved: [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md)

---

## 1. Golden rules

These protect the product's core promise — *explainable, human-controlled AI* — and the parts of the system that already work. Do not break them.

1. **Humans decide.** Never add code that approves, rejects, files or otherwise acts on a recommendation without an explicit human action. New recommendations are created with status `pending` (enforced in `addRecommendation()`).
2. **Keep provenance.** Every extracted fact must carry its real `documentId`, `sourceDoc` (filename), `sourcePage` and `sourceSnippet`. Never attribute a fact to a document or page it did not come from.
3. **Be honest about confidence.** Confidence is an uncalibrated heuristic. Keep the "uncalibrated / heuristic only" wording and never present it as a probability.
4. **Label simulations and the demo build.** Google Drive, the demo engine, the evaluation metrics and browser-only storage are simulated, illustrative or limited — keep them labelled. Never make a connection look live when it is not.
5. **Audit everything.** Every user-visible action must call `log(caseId, action, details, category)` from `useStore()`.
6. **Secrets stay on the server.** Read `process.env.*` only in `src/lib/server-config.ts` and route handlers. Never use a `NEXT_PUBLIC_` prefix for secrets. Never commit `.env` or `.dev.vars`.
7. **All data changes go through the store and the workspace rules.** Pages call `useStore()`; the store calls the pure functions in `src/lib/workspace.ts`. Never write to IndexedDB from a page, and never bypass a rule (validation, locked reviews, append-only audit).
8. **The demo dataset lives in `src/data/demo-data.ts`.** Fictional data only — never add real client documents to it, to tests or to fixtures.
9. **Keep the server stateless and small.** The Worker has three routes (`analyze`, `config`, `health`). Do not add server-side storage without a deliberate decision (see CONTEXT.md §17 for the options). Keep heavy libraries out of the server bundle.
10. **Accounts are not security.** Browser-local accounts identify users for the audit trail. Never describe them as protecting data, and never store a password without `hashPassword()`.
11. **Keep the build green.** Run the validation sequence (§8) before every commit — both the Next.js and the Cloudflare builds.

---

## 2. Architecture in one page

```
Browser (all pages are client components)
  pages ──► useStore()  (src/lib/store.tsx)
               ├─► rules: src/lib/workspace.ts (pure functions)  ──► saved to IndexedDB (src/lib/browser-db.ts)
               ├─► accounts: src/lib/accounts.ts (demo accounts + bcrypt-hashed local accounts)
               ├─► extractFile(): src/lib/extract.ts (PDF.js / mammoth, loaded on demand, in the browser)
               └─► analyze(): POST /api/analyze (only when Live AI is configured)
  case page ──► runAnalysis() (src/lib/core.ts) in Demo Mode or when Live AI fails
  first visit / "Reset demo data" ──► demoWorkspace() from src/data/demo-data.ts

Server (Cloudflare Worker via vinext, or next dev) — stateless
  GET /api/config · GET /api/health · POST /api/analyze ──► OpenAI-compatible LLM (only if LLM_API_KEY is set)
```

- **Rendering:** every page starts with `"use client"`. The root layout (`src/app/layout.tsx`, a server component) wraps the app in `StoreProvider`.
- **Workspace:** pages that need a sign-in live in `src/app/(app)/`. Its `layout.tsx` waits for `ready` (saved sign-in and workspace loaded) and shows "Sign in required" when there is no user.
- **Persistence:** each change saves the whole workspace to IndexedDB (key `workspace`). Accounts and the current sign-in use the keys `accounts` and `session`. If storage is blocked, the app keeps working in memory and warns once.
- **Analysis:** `analyze()` returns `{mode:"demo"}` immediately in Demo Mode; otherwise `/api/analyze` returns `mode: "llm"` with verified citations or `mode: "demo"` with a reason, and the case page falls back to `runAnalysis()`.
- **Two toolchains, one app:** `next dev` / `next build` for local development; vinext (Vite) builds the same `src/app` into a Cloudflare Worker (`*:cloudflare` scripts, `npm run deploy`).

See CONTEXT.md §4 for the diagram and §6 for the data model.

---

## 3. Tech stack & important dependencies

| Package | Version | Used for | Where | Notes |
|---|---|---|---|---|
| `next` | 16.4.6 | App Router, route handlers, local dev/build | everywhere | Dynamic route `params` is a Promise in route handlers |
| `vinext`, `vite`, `@vinext/cloudflare`, `@cloudflare/vite-plugin`, `cf` | 1.4.6, 8.3.8, 1.4.0, 2.0.0-rc.3, 1.0.0-rc.2 | Cloudflare Workers build and deploy | `vite.config.ts`, `cloudflare.config.ts` | Pinned exactly; `vinext init` once wrote a vulnerable Vite range — keep `vite` at a patched version |
| `react`, `react-dom` | 19.3.1 | UI | pages | vinext requires ≥ 19.3.1 |
| `typescript` | 5.9.3 | Strict typing | everywhere | `@/*` → `src/*` (also aliased in `vitest.config.ts`) |
| `tailwindcss`, `@tailwindcss/postcss` | 4.1.17 | Styling | `globals.css`, all JSX | v4: theme tokens live in CSS (`@theme`); no `tailwind.config.js` |
| `lucide-react` | ^1.73.0 | Icons | pages, `ui.tsx` | |
| `unpdf` | ^1.9.1 | PDF text (PDF.js) | `src/lib/extract.ts` | Imported dynamically; `mergePages: false` returns one string per page |
| `mammoth` | ^1.13.0 | DOCX text | `src/lib/extract.ts` | Use the self-contained `mammoth/mammoth.browser.min.js` with `{ arrayBuffer }` — the main build needs Node's `fs`/`path`. It also runs in Node, so tests use the same path |
| `papaparse` | ^5.7.1 | RFC 4180 CSV | `src/lib/csv.ts` | Use `Papa.unparse()` for exports |
| `bcryptjs` | ^3.0.3 | Password hashing | `src/lib/password.ts` | Cost 10; works in the browser |
| `vitest` | ^5.1.0 | Unit tests | `tests/` | `npm test` |
| `jszip` | ^3.10.2 | Builds DOCX test fixtures | tests only | |
| `eslint`, `eslint-config-next` | 9.39.4 / 16.4.6 | Linting | `eslint.config.mjs` | Ignores `.next/`, `dist/`, `.vinext/`, `.cloudflare/` |

`package.json` has `"type": "module"` (required by vinext) and `overrides.fflate = 0.7.5` (patched transitive dependency under vinext's OG-image support). Runtime: **Node.js ≥ 22**. The optional LLM is any OpenAI-compatible Chat Completions API (default model `gpt-4o-mini`).

---

## 4. Setup

### Install and run (development)

```bash
npm install
npm run dev                     # http://localhost:3000 — no database needed
```

Open `/login` and click a demo account (`demo@caseclarity.ai` or `caseworker@caseclarity.ai`, password `demo1234`). The fictional dataset is copied into your browser on first visit.

### Cloudflare build and local preview

```bash
npm run build:cloudflare        # Worker output in .cloudflare/output/
npm run preview:cloudflare      # runs it in workerd at http://localhost:4173
npm run dev:cloudflare          # optional: vinext dev server (port 3001)
```

### Deploy

```bash
npx cf auth login               # once (or set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in CI)
npm run deploy
```

Keep `GET /api/health` public — hosting checks use it.

### Enabling the real LLM (optional)

- **`npm run dev`:** set `LLM_API_KEY` (and optionally `LLM_BASE_URL`, `LLM_MODEL`) in `.env` (copy `.env.example`) and restart.
- **Cloudflare:** uncomment the `bindings.secret()` lines in `cloudflare.config.ts`, set the secrets in the Cloudflare dashboard (or `.dev.vars` for the local preview — copy `.dev.vars.example`), rebuild/redeploy. Declared secrets are required at deploy, so they stay commented out in Demo Mode. `nodejs_compat` exposes them on `process.env`.

The endpoint targets OpenAI-compatible Chat Completions APIs that support `response_format: {type: "json_object"}`. Citations are verified server-side (`src/lib/llm.ts`). Tested against a mock OpenAI-compatible server, not yet with a live key.

### Inspecting or clearing the browser data

DevTools → Application → IndexedDB → `caseclarity-ai` → `kv` (keys `workspace`, `accounts`, `session`). *Reset demo data* in the sidebar (senior case workers) restores the dataset; deleting the database also removes local accounts.

---

## 5. Where things go

| You want to… | Put it in |
|---|---|
| Change the demo dataset or demo accounts | `src/data/demo-data.ts` (then run `npm test` — `workspace.test.ts` checks references) |
| Add a workspace page (sign-in required) | `src/app/(app)/<name>/page.tsx`, then add it to `NAV` in `src/app/(app)/layout.tsx` |
| Add a public page | `src/app/<name>/page.tsx` |
| Add a data operation or rule | a pure function in `src/lib/workspace.ts` + a store method in `src/lib/store.tsx` + a test |
| Add a field to a record | the type in `src/lib/core.ts`, the clean-up in `workspace.ts`, the demo data if needed; bump `WORKSPACE_VERSION` if old saved workspaces would break |
| Change sign-in or sign-up rules | `src/lib/accounts.ts` |
| Change the analysis heuristics | `runAnalysis()` in `src/lib/core.ts` |
| Change the LLM prompt or validation | `src/lib/llm.ts`; the provider call is in `src/app/api/analyze/route.ts` |
| Change document parsing | `src/lib/extract.ts` |
| Change CSV parsing or import rules | `src/lib/csv.ts` (dedupe is applied in `importCases()` in `workspace.ts`) |
| Add a server endpoint | `src/app/api/<name>/route.ts` — stateless; read config only through `src/lib/server-config.ts` |
| Change Cloudflare settings | `cloudflare.config.ts` |
| Add a reusable UI element | `src/components/ui.tsx` |
| Add tests | `tests/<area>.test.ts` |

---

## 6. Coding conventions

### TypeScript

- `strict` mode is on. Avoid `any`; treat anything read from storage or the network as `unknown` and validate it (see `loadWorkspace()`, `readJson()`).
- Import with the `@/` alias (`@/lib/core`, `@/data/demo-data`, `@/components/ui`).
- Domain types live in `src/lib/core.ts`. Dates are ISO strings. New ids come from `newId()` (`crypto.randomUUID()`).
- Shared modules (everything in `src/lib` except `store.tsx`, `browser-db.ts` and `server-config.ts`) must run in the browser, on Workers and in Node tests: no `Buffer`, `fs`, `path` or Node `crypto`.
- With Cloudflare's Worker types, `Response.json()` returns `unknown` — cast it to the expected shape.

### React and Next.js

- Pages and interactive components start with `"use client"` and read and write data through `useStore()`.
- Store methods throw a readable `Error` when a rule is broken — always `try/catch` them and show `errorMessage(e)`; never report success before the `await` resolves.
- User feedback goes through `notify(message, "ok" | "warn")`. **Never use `alert()`, `confirm()` or `prompt()`** — sandboxed previews block them; use the two-click confirmation pattern (see *Delete case* and *Reset demo data*).
- Client pages read route params with `useParams()`.
- Route handlers declare `export const dynamic = "force-dynamic"`. Do not add `export const runtime = "nodejs"` — the Worker is the runtime.
- Browser-only heavy code: load it with a dynamic `import()` behind an `import.meta.env?.SSR` guard so the Cloudflare server build can drop it (see `extractFile` in `store.tsx`).

### Workspace rule template

```ts
// src/lib/workspace.ts — pure: takes a workspace, returns a new one, throws WorkspaceError on bad input.
export function renameCase(ws: Workspace, id: string, title: string, now = new Date().toISOString()) {
  const v = str(title, 200);
  if (!v) throw new WorkspaceError("Title cannot be empty");
  return updateCase(ws, id, { title: v }, now);
}

// src/lib/store.tsx — apply and save; then log from the page.
const renameCase = useCallback(async (id: string, title: string) => {
  const r = W.renameCase(wsRef.current, id, title);
  apply(r.ws);
  return r.item;
}, [apply]);
```

### API route template

```ts
import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-config";
import { readJson, str } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  const body = await readJson(req);
  const name = str(body.name, 255);
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  return NextResponse.json({ ok: true, name });
}
```

- Respond with JSON. Errors carry an `error` string and a meaningful status (400, 403, 413, 500).
- Never trust the request body: sanitise with `str`, `int`, `oneOf`, `strList` from `src/lib/validate.ts` and cap sizes.

### Styling and UI

- Tailwind utility classes only; global CSS stays in `src/app/globals.css`.
- Colours in use: primary navy `#0f2043`, hover `#1e3a5f`, accent blue `#2563eb`, page background `#f6f8fb`, white cards with `border-slate-200/80`, `rounded-2xl`, soft shadow.
- Reuse the primitives in `src/components/ui.tsx`: `Card`, `Btn` (`primary`, `secondary`, `ghost`, `danger`, `success`), `Badge`, `StatusBadge`, `EngineBadge`, `AiModeBanner`, `EmptyState`, `Field` with `inputCls`, `SafetyBanner`, `PriorityDot`, `Logo`. Any new status value must be added to `StatusBadge`.
- Layouts are responsive and mobile-first (the sidebar becomes a drawer below `lg`). In CSS grids whose cells contain truncated text, add `*:min-w-0` to the grid or the cells overflow on phones.
- Wording: call AI output a "recommendation", "AI-generated" or "suggested" — never a "decision". Show the source next to every fact.

### Naming

- Next.js file conventions: `page.tsx`, `layout.tsx`, `route.ts`. Components `PascalCase`; functions and variables `camelCase`.
- Audit `action` strings are short past-tense phrases ("Document uploaded", "Recommendation approved"). `category` is one of `case`, `document`, `ai`, `review`, `integration`, `system`.

---

## 7. Making changes without breaking things

### 7.1 Before you start

- Read the relevant part of CONTEXT.md, especially **§16 Known limitations**.
- Run `npm test` and `npm run build` first so you know the baseline is green.

### 7.2 Recipes

**Change the data model** — update the type in `core.ts`, the clean-up function in `workspace.ts` (lengths, defaults), the demo data, and tests. If workspaces already saved in browsers would no longer load correctly, bump `WORKSPACE_VERSION`: visitors then get the fresh demo data.

**Change the demo engine (`runAnalysis`)** — keep the invariants: split pages on `\f`; every fact has its real `documentId`, filename, page and snippet; every evidence item has `doc`, `page` and `snippet`; the uncertainties keep the "uncalibrated" caveat; recommendations start as `pending`. Update `tests/analysis.test.ts` and `tests/extraction.test.ts`.

**Change the LLM integration** — keep the response contract (`mode: "llm"` with `result`, or `mode: "demo"` with `reason`). If you change the JSON shape, update `validateLlmResult()` and the mapping in `runAI` (`src/app/(app)/cases/[id]/page.tsx`). Keep the key on the server and the safety instructions in the system prompt.

**Change document extraction** — keep joining PDF pages with `\f`, the 10 MB limit and the `warning` field. Keep it free of Node-only APIs. Add a test with a generated fixture (`makePdf`, `makeDocx` in `tests/extraction.test.ts`).

**Change accounts** — use `authenticate()` / `createAccount()` in `src/lib/accounts.ts`; passwords only through `hashPassword()` / `verifyPassword()`. Keep `tests/accounts.test.ts` passing.

**Change CSV import or export** — use `parseCasesCSV`, `buildCasesFromRows`, `dedupeCases` and `toCSV`. Keep the import report honest — nothing may be dropped silently.

**Bring back a shared backend** — keep `workspace.ts` as the rules layer, add a storage adapter on the server (e.g. Cloudflare D1, or the PostgreSQL version at commit `34dd6c0`), and replace `apply()`/IndexedDB in the store with API calls. Restore server-side authentication before calling it secure.

### 7.3 Gotchas

- `vinext build` overwrites `.next/types/routes.d.ts`; `npm run typecheck` runs `next typegen` first to regenerate Next's version. Run the typecheck through the npm script.
- Workers and the Cloudflare Vite plugin read secrets only when they are declared in `cloudflare.config.ts` (`bindings.secret()`), and declared secrets are required at deploy.
- The PDF.js and mammoth chunks must stay out of the Worker bundle (≈ 380 KB gzipped today). Check `.cloudflare/output/v1/workers/default/bundle` after adding dependencies.
- Two open tabs each hold a copy of the workspace; the last change saved wins.
- Re-running an analysis replaces the case's facts and adds a new recommendation; older recommendations remain and the newest one is displayed.
- Tests are excluded from `tsconfig.json`; Vitest compiles them itself.
- Mode labels come from `useStore().config` (`GET /api/config`) and each recommendation's `engine` (`seed` | `demo` | `llm`).

### 7.4 Definition of done

- [ ] The validation sequence (§8) passes, including `npm run build:cloudflare`
- [ ] The golden rules (§1) still hold
- [ ] New user-visible actions write audit entries
- [ ] Simulated or illustrative features are still labelled
- [ ] Tests were added or updated for logic changes
- [ ] CONTEXT.md is updated (feature status, limitations, remaining work)

---

## 8. Validation sequence

Run these from the project root before every commit (CI runs the same):

```bash
npm test                     # 56 tests — all must pass
npm run typecheck            # next typegen + tsc --noEmit
npm run lint                 # ESLint (0 problems)
npm run build                # Next.js build
npm run build:cloudflare     # Cloudflare Worker build
```

**Smoke test** against a running server (`npm run dev`, or `npm run preview:cloudflare` on port 4173):

```bash
curl -s localhost:3000/api/health          # {"ok":true}
curl -s localhost:3000/api/config          # {"aiMode":"demo","model":null} without a key
curl -s -X POST localhost:3000/api/analyze -H "Origin: https://evil.example" -d '{}'   # 403
```

**UI check:** sign in with a demo account → open CC-2026-003 → Recommendation tab → Approve with a comment → the decision appears on the case's Audit tab and on `/audit` → reload: it is still there → *Reset demo data* restores the dataset. Also check a phone-width window (390 px) for horizontal scrolling.

---

## 9. Repository hygiene

- `.gitignore` excludes `node_modules/`, `.next/`, `dist/`, `.vinext/`, `.cloudflare/`, `.env`, `.env*.local`, `.dev.vars*` (except `.dev.vars.example`), `*.tsbuildinfo`, `next-env.d.ts`, logs and editor folders. Never force-add ignored files.
- Never commit `.env`, `.dev.vars` or real keys. Document every new variable in `.env.example` and `.dev.vars.example`.
- Add dependencies with `npm install <package>` (`-D` for dev-only tools) and pin Cloudflare/vinext tooling exactly. Check `npm audit --omit=dev` stays clean.
- Suggested commit style: short imperative messages with a scope, e.g. `fix(store): keep audit entries newest-first`.
- Update CONTEXT.md in the same change whenever features, routes, data shapes, environment variables or limitations change.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
