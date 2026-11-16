# AGENTS.md — How to Work on CaseClarity AI

> Instructions for **developers and AI coding assistants** working in this repository: architecture, tech stack, setup, coding conventions, important dependencies, and the rules for making changes without breaking existing functionality.
>
> - Full inventory of what exists (features, API, data model, known issues): [CONTEXT.md](./CONTEXT.md)
> - Product goals and the problem being solved: [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md)

---

## 1. Golden rules

These protect the product's core promise — *explainable, human-controlled AI* — and the parts of the system that already work. Do not break them.

1. **Humans decide.** Never add code that approves, rejects, files or otherwise acts on a recommendation without an explicit human action. New recommendations are created with status `pending`.
2. **Keep provenance.** Every extracted fact must carry its real `documentId`, `sourceDoc` (filename), `sourcePage` and `sourceSnippet`. Never attribute a fact to a document or page it did not come from.
3. **Be honest about confidence.** Confidence is an uncalibrated heuristic. Keep the "uncalibrated / heuristic only" wording and never present it as a probability.
4. **Label simulations.** Google Drive, the demo engine and the evaluation metrics are simulated or illustrative — keep them labeled. Never make a connection look live when it is not.
5. **Audit everything.** Every user-visible action must call `log(caseId, action, details, category)` from `useStore()`.
6. **Secrets stay on the server.** Read `process.env.*` only in route handlers and server-only modules. Never use a `NEXT_PUBLIC_` prefix for secrets. Never commit `.env`.
7. **Use the auth helpers.** Passwords go only through `src/lib/password.ts` (bcrypt); sessions only through `src/lib/auth-server.ts`. Never return password hashes or raw session tokens.
8. **Protect every data route.** Start each handler with `requireUser()` and return 401 when it returns null. The only intentional exceptions are `GET /api/health`, `GET /api/config` (non-secret flags) and `POST /api/auth`. Manager-only actions also check `isManager(user)` and return 403. State-changing requests are origin-checked by `src/proxy.ts`.
9. **No browser storage for data or credentials.** All data lives in PostgreSQL behind the API. localStorage was removed on purpose — do not reintroduce it.
10. **Fictional data only.** Never add real client documents to seeds, tests or fixtures.
11. **Keep the build green.** Run the validation sequence (§8) before every commit.

---

## 2. Architecture in one page

```
Browser (all pages are client components)
  pages ──► useStore()  (src/lib/store.tsx) ──fetch + cookie──► /api/* Route Handlers ──Drizzle──► PostgreSQL
  case + upload pages ──► POST /api/extract   (unpdf for PDF, mammoth for DOCX)
  case page ──► POST /api/analyze ──► LLM API  (only when LLM_API_KEY is set)
                       └─ mode "demo" ──► runAnalysis() runs in the browser (src/lib/core.ts)
```

- **Rendering:** every page starts with `"use client"`. The root layout (`src/app/layout.tsx`, a server component) wraps the app in `StoreProvider`.
- **Workspace:** pages that need a login live in the `src/app/(app)/` route group. Its `layout.tsx` waits for the session check (`ready`) and renders "Sign in required" when there is no user. Data is protected separately on the server by `requireUser()`.
- **Data access:** `StoreProvider` is the single gateway for reading and writing data; it updates React state from server responses. Exceptions: `/api/extract` (multipart upload) and `/api/analyze` are called directly from the upload and case pages.
- **Analysis:** `/api/analyze` returns `mode: "llm"` with structured JSON, or `mode: "demo"`, which makes the client run the deterministic `runAnalysis()`.
- **Module boundaries:**
  - Shared: `src/lib/core.ts`, `src/lib/csv.ts`
  - Server-only: `src/db/*`, `src/lib/auth-server.ts`, `src/lib/password.ts`, `src/lib/extract.ts` — **never import these into a client component** (they rely on `pg`, `next/headers`, Node `crypto` and `Buffer`)
  - Client-only: `src/lib/store.tsx`, `src/components/ui.tsx`, all pages

See CONTEXT.md §4 for the full diagram and §7 for the API reference.

---

## 3. Tech stack & important dependencies

| Package | Version | Used for | Where | Notes |
|---|---|---|---|---|
| `next` | 16.4.2 | App Router, Route Handlers, builds | everywhere | Dynamic route `params` is a Promise; `cookies()` is async |
| `react`, `react-dom` | 19.2.6 | UI | pages | |
| `typescript` | 5.9.3 | Strict typing | everywhere | `@/*` → `src/*` |
| `tailwindcss`, `@tailwindcss/postcss` | 4.1.17 | Styling | `globals.css`, all JSX | v4: theme tokens live in CSS (`@theme`); there is no `tailwind.config.js` |
| `lucide-react` | ^1.73.0 | Icons | pages, `ui.tsx` | |
| `drizzle-orm` | 0.45.2 | Queries and schema | `src/db`, API routes | **Silently ignores object keys that are not columns** |
| `drizzle-kit` | 0.31.10 | `npm run db:push` | CLI | `drizzle.config.ts` reads `DATABASE_URL` from `.env` |
| `pg` | 8.20.0 | PostgreSQL pool | `src/db/index.ts` | |
| `unpdf` | ^1.9.1 | PDF text (PDF.js) | `src/lib/extract.ts` | `mergePages: false` returns one string per page |
| `mammoth` | ^1.13.0 | DOCX text | `src/lib/extract.ts` | In Node pass `{ buffer }`; `{ arrayBuffer }` fails with "Could not find file in options" |
| `papaparse` | ^5.7.1 | RFC 4180 CSV | `src/lib/csv.ts` | Use `Papa.unparse()` for exports |
| `bcryptjs` | ^3.0.3 | Password hashing | `src/lib/password.ts` | Cost factor 10 |
| `vitest` | ^5.1.0 | Unit tests | `tests/` | Run with `npm test` |
| `jszip` | ^3.10.2 | Builds DOCX test fixtures | tests only | |
| `eslint`, `eslint-config-next` | 9.39.4 / 16.4.2 | Linting | `eslint.config.mjs` | `next/core-web-vitals` rules |

Runtime: **Node.js 22** (developed and tested on v22.23.4) and **PostgreSQL 15** (tested on 15.19). The optional LLM is any OpenAI-compatible Chat Completions API (default model `gpt-4o-mini`).

---

## 4. Setup

### Prerequisites

- Node.js 22 and npm 10
- PostgreSQL 15 with an empty database (for example `app_db`)

### Install and run (development)

```bash
npm install
cp .env.example .env            # set DATABASE_URL; LLM_API_KEY is optional
# drizzle.config.ts reads DATABASE_URL from .env
npx drizzle-kit push            # create or update tables from src/db/schema.ts
npm run dev                     # http://localhost:3000
```

Open `/login` and sign in with **`demo@caseclarity.ai` / `demo1234`**. On the first login the demo user is created (bcrypt-hashed) and, if the `cases` table is empty, the fictional dataset is seeded automatically.

### Production build

```bash
npm run build
npm run start
curl http://localhost:3000/api/health      # {"ok":true}
```

Keep `GET /api/health` public — the hosting/preview pipeline builds the app, starts the production server and uses this endpoint as its health check.

### Enabling the real LLM (optional)

Set `LLM_API_KEY` (and optionally `LLM_BASE_URL` and `LLM_MODEL`) in `.env` and restart. The endpoint targets OpenAI-compatible Chat Completions APIs that support `response_format: {type: "json_object"}`. This path has not yet been verified with a live key (CONTEXT.md KI-8), and some UI labels say "Demo Mode" regardless of the mode (KI-11).

### Useful commands

```bash
psql postgresql://postgres:postgres@127.0.0.1:5432/app_db -c "select count(*) from cases"
npm test                        # unit tests
npm run lint                    # ESLint
```

Reset the demo data from the sidebar ("Reset demo data"), which calls `POST /api/seed?reset=1` and deletes all case data (users are kept).

---

## 5. Where things go

| You want to… | Put it in |
|---|---|
| Add a workspace page (login required) | `src/app/(app)/<name>/page.tsx`, then add it to `NAV` in `src/app/(app)/layout.tsx` |
| Add a public page | `src/app/<name>/page.tsx` |
| Add an API endpoint | `src/app/api/<name>/route.ts`, plus a method in `src/lib/store.tsx` if the UI needs it |
| Add or change a table or column | `src/db/schema.ts`, plus the matching type in `src/lib/core.ts` |
| Add a domain type, constant, seed record or formatter | `src/lib/core.ts` |
| Change the analysis heuristics | `runAnalysis()` in `src/lib/core.ts` |
| Change the LLM prompt or provider call | `src/app/api/analyze/route.ts` |
| Change document parsing | `src/lib/extract.ts` |
| Change CSV parsing or import rules | `src/lib/csv.ts` |
| Add a reusable UI element | `src/components/ui.tsx` |
| Add tests | `tests/<area>.test.ts` |

---

## 6. Coding conventions

### TypeScript

- `strict` mode is on. Avoid `any`; type request bodies where they enter the system.
- Import with the `@/` alias (`@/lib/core`, `@/db`, `@/components/ui`).
- Domain types live in `src/lib/core.ts` and must match `src/db/schema.ts`. Dates are ISO strings on the client.
- IDs come from the database (UUIDs). `uid()` is only for temporary client-side objects; POST routes ignore client IDs.

### React and Next.js

- Pages and interactive components start with `"use client"` and read and write data through `useStore()`.
- User feedback goes through `notify(message, "ok")` or `notify(message, "warn")` (toast). **Never use `alert()`, `confirm()` or `prompt()`** — sandboxed previews block them, so the action looks broken.
- Client pages read route params with `useParams()`.
- Route handlers declare `export const dynamic = "force-dynamic"`, and add `export const runtime = "nodejs"` when they need Node APIs (see `/api/extract`).
- In dynamic route handlers, `params` is a Promise in Next 16: `{ params }: { params: Promise<{ id: string }> }`, then `const { id } = await params`.
- `cookies()` from `next/headers` is async: `const jar = await cookies()`.

### API route template

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.caseId || !body.name) {
    return NextResponse.json({ error: "caseId and name are required" }, { status: 400 });
  }

  const [row] = await db
    .insert(documents)
    .values({ caseId: body.caseId, name: body.name, type: body.type || "TXT" }) // real columns only
    .returning();
  return NextResponse.json({ document: row }, { status: 201 });
}
```

- Respond with JSON. Errors carry an `error` string and a meaningful status (400, 401, 404, 409, 413, 500).
- `PATCH` handlers copy only whitelisted fields (see the `ALLOWED` arrays in the existing `[id]` routes).
- Use Drizzle's query builder; never build SQL strings from user input.

### Styling and UI

- Tailwind utility classes only; no CSS modules. Global CSS stays in `src/app/globals.css` (theme tokens, `animate-fadeUp`, `animate-pulseDot`, `scrollbar-thin`).
- Colors in use: primary navy `#0f2043` (buttons, headings), `#1e3a5f` (hover and gradients), accent blue `#2563eb` (links, highlights), page background `#f6f8fb`, white cards with `border-slate-200/80`, `rounded-2xl` and a soft shadow. Theme tokens (`navy-*`, `soft-*`) exist in `globals.css`, but the code currently uses the hex values directly — stay consistent with the surrounding code.
- Reuse the primitives in `src/components/ui.tsx`: `Card`, `Btn` (variants `primary`, `secondary`, `ghost`, `danger`, `success`), `Badge`, `StatusBadge`, `EmptyState`, `Field` with `inputCls`, `DemoBanner`, `SafetyBanner`, `PriorityDot`, `Logo`.
- Any new status value must be added to the map inside `StatusBadge`.
- Icons come from `lucide-react`. Layouts are responsive and mobile-first (the sidebar becomes a drawer below `lg`). Page roots use `animate-fadeUp`.
- Wording: call AI output a "recommendation", "AI-generated" or "suggested" — never a "decision". Show the source next to every fact.

### Naming

- Next.js file conventions: `page.tsx`, `layout.tsx`, `route.ts`. Components use `PascalCase`; functions and variables use `camelCase`; database columns are `snake_case` and map to `camelCase` Drizzle fields.
- Audit `action` strings are short past-tense phrases ("Document uploaded", "Recommendation approved"). `category` is one of `case`, `document`, `ai`, `review`, `integration`, `system`.

---

## 7. Making changes without breaking things

### 7.1 Before you start

- Read the relevant part of CONTEXT.md, especially **§16 Known issues** — some surprising behavior is already known and documented.
- Run `npm test` and `npm run build` first so you know the baseline is green.

### 7.2 Recipes

**Change the database schema**

1. Edit `src/db/schema.ts`.
2. Run `npm run db:push` (it reads `DATABASE_URL`).
3. Update the matching type in `src/lib/core.ts`.
4. Update the API routes: `insert().values(...)`, the `ALLOWED` lists and responses.
5. Update `src/app/api/seed/route.ts` if the seed data should fill the new column.
6. Confirm the column really exists — Drizzle silently drops keys that are not columns (this is how KI-1 happened).
7. Reset the demo data and run the validation sequence.

**Add an API endpoint** — start from the template above, protect it with `requireUser()`, add a store method that calls it and updates state from the response, and log user-visible actions.

**Add a workspace page** — create `src/app/(app)/<name>/page.tsx` with `"use client"`, `useStore()` and `animate-fadeUp`; add it to `NAV`; reuse `Card`, `Btn` and `EmptyState`.

**Change the demo engine (`runAnalysis`)**

- Keep the invariants: split pages on `\f`; every fact has its real `documentId`, filename, page and snippet; every evidence item has `doc`, `page` and `snippet`; the uncertainties keep the "uncalibrated" caveat; recommendations start as `pending`.
- Update `tests/extraction.test.ts`.
- Re-check the seeded cases (the KI-6 table in CONTEXT.md) and update the docs if the results change.

**Change the LLM integration**

- Keep the response contract: `mode: "llm"` with `result`, or `mode: "demo"`. The client falls back to the demo engine on anything else.
- If you change the JSON shape, update the mapping in `runAI` (`src/app/(app)/cases/[id]/page.tsx`).
- Keep the key on the server and keep the safety instructions in the system prompt.

**Change document extraction**

- Keep joining PDF pages with `\f` — the page attribution in `runAnalysis()` depends on it.
- Keep the 10 MB limit and the `warning` field for empty or unsupported files.
- Add a test with a generated fixture (see `makePdf` and `makeDocx` in `tests/extraction.test.ts`).

**Change authentication**

- Use `createSession`, `destroySession`, `getSessionUser`, `requireUser` and `ensureDemoUser`. Do not weaken the cookie flags. Keep `tests/auth.test.ts` passing.

**Change CSV import or export**

- Use `parseCasesCSV`, `buildCasesFromRows` and `dedupeCases` from `src/lib/csv.ts`. Dedupe stays on the server in `POST /api/cases`. Extend `tests/csv.test.ts`. Keep the import report honest — nothing may be dropped silently.

### 7.3 Gotchas

- Drizzle silently ignores unknown keys on insert and update.
- The list `GET` routes return records newest-first (extractions: in creation order). The store prepends new items to match.
- `log()` adds a temporary entry (its `id` starts with `tmp-`) to local state; the stored copy appears after a reload.
- `POST /api/seed` requires a session and demo mode (`DEMO_ACCOUNT`); it only seeds an empty database. `?reset=1` (managers only) wipes all case data (not users) and logs the reset.
- Store mutations throw on failure — always `try/catch` them and show `errorMessage(e)`; never report success before the `await` resolves.
- Recommendation reviews go through `PATCH /api/recommendations/[id]`, which only accepts `status`, `reviewComment` and `summary` (for `modified`); the reviewer is the session user, and approved/rejected recommendations are locked.
- Re-running an analysis replaces the case's facts and adds a new recommendation. Older recommendations remain; the newest one is displayed.
- Tests are excluded from `tsconfig.json`, so `next build` will not catch type errors in tests — run Vitest.
- Mode labels come from `useStore().config` (`GET /api/config`) and each recommendation's `engine` (`seed` | `demo` | `llm`).

### 7.4 Definition of done

- [ ] The validation sequence (§8) passes
- [ ] The golden rules (§1) still hold
- [ ] New user-visible actions write audit entries
- [ ] Simulated or illustrative features are still labeled
- [ ] Tests were added or updated for logic changes
- [ ] CONTEXT.md is updated (feature status, known issues, remaining work)

---

## 8. Validation sequence

Run these from the project root before every commit:

```bash
npm test                                    # 41 tests — all must pass
npx next typegen                            # generate route types
npm exec tsc -- --noEmit --pretty false     # type check
npm run lint                                # ESLint (0 problems at last review)
npm run build                               # production build
```

**Manual smoke test** against a running server (`npm run dev` or `npm run start`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/cases          # expect 401
curl -s -c /tmp/cj -X POST localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"demo@caseclarity.ai","password":"demo1234"}' # expect {"user":…}
curl -s -b /tmp/cj -X POST localhost:3000/api/extract -F "file=@sample.pdf" # expect extracted text
curl -s -b /tmp/cj -X POST localhost:3000/api/analyze \
  -H "Content-Type: application/json" -d '{"text":"Maria Gonzalez pays $1,450"}' # expect a mode field
```

**UI check:** sign in → Dashboard → open CC-2026-003 → Recommendation tab → Approve with a comment → the decision appears on the case's Audit tab and on `/audit`. Use "Reset demo data" afterwards.

---

## 9. Repository hygiene

- `.gitignore` excludes `node_modules/`, `.next/`, `.env`, `.env*.local`, `*.tsbuildinfo`, `next-env.d.ts`, logs and editor folders. Never force-add ignored files (`git add -f`).
- Never commit `.env` or real keys. Document every new variable in `.env.example`.
- Add dependencies with `npm install <package>` (use `-D` for dev-only tools) so `package-lock.json` stays in sync.
- Suggested commit style: short imperative messages with a scope, e.g. `fix(api): return audit entries newest-first`.
- Update CONTEXT.md in the same change whenever features, endpoints, tables, environment variables or known issues change.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
