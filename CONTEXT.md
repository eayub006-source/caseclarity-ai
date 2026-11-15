# CONTEXT.md — CaseClarity AI project context

> **Read this first.** This document describes what actually exists in the repository today, how it is wired, how to run it, and how to change it safely. It is derived from the source code, not from the original pitch.
>
> Companion documents: [`PROBLEM_STATEMENT.md`](./PROBLEM_STATEMENT.md) (why we are building this) and [`ARCHITECTURE.md`](./ARCHITECTURE.md) (technical deep dive).

---

## 1. Current status at a glance

| Area | Status | Notes |
|------|--------|-------|
| Public marketing page (`/`) | ✅ Working | Features, how-it-works, safety, about, CTA sections. |
| Authentication (`/login`, `/signup`) | ✅ Working | bcrypt hashes + server-side sessions; demo account seeded on first login. |
| PostgreSQL persistence | ✅ Working | Drizzle ORM; 7 tables; all reads/writes through authenticated APIs. |
| Dashboard (`/dashboard`) | ✅ Working | Live case/document/recommendation/audit counts. |
| Case list & filters (`/cases`) | ✅ Working | Search, status/type filter, CSV export. |
| Case creation (`/cases/new`) | ✅ Working | Auto case number, priority, description. |
| Case detail (`/cases/[id]`) | ✅ Working | Tabs: Overview, Documents, Analysis, Recommendation, Human Review, Audit. |
| Real PDF/DOCX/TXT extraction | ✅ Working | `unpdf` (PDF.js) + `mammoth`; server-side only. |
| Evidence attribution | ✅ Working | Each fact keeps document ID, filename, page, snippet. |
| Explainable recommendation | ✅ Working | Reasoning, evidence, missing info, uncertainties, next steps, confidence. |
| Human review actions | ✅ Working | Approve / modify / reject / request documents / flag, all audit-logged. |
| Audit trail (`/audit`) | ✅ Working | Full list plus per-case timeline. |
| CSV import/export (`/integrations`) | ✅ Working | PapaParse import with dedupe and warnings; client-side export. |
| Google Drive import | ⚠️ **Simulated** | Fixed fictional file list; labeled "Simulated"; no OAuth/Drive API. |
| Live LLM analysis | ⚠️ **Code path present, inactive** | Activates only with `LLM_API_KEY`; see §11 configuration gap. |
| Evaluation page (`/evaluation`) | ⚠️ **Illustrative** | Static metrics; page totals hardcoded; labeled as illustrative. |
| Automated tests | ✅ 14 tests / 3 files | Extraction, attribution, password hashing, CSV. No API/E2E tests yet. |

**Bottom line:** this is a working full-stack prototype, not a mock. The main honest caveats are the simulated Drive integration, the currently-inactive LLM key configuration, illustrative evaluation numbers, and the single shared workspace (no per-user data isolation).

---

## 2. Tech stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Framework | Next.js (App Router, Turbopack) | 16.4.2 | Routing, server routes, build |
| UI runtime | React / React DOM | 19.2.6 | Client components |
| Language | TypeScript (strict) | 5.9.3 | Type safety across app |
| Styling | Tailwind CSS + `@tailwindcss/postcss` | 4.1.17 | Utility-first styling, custom theme tokens |
| Icons | `lucide-react` | ^1.73.0 | Icon set |
| Database | PostgreSQL | local instance | Primary datastore |
| ORM | `drizzle-orm` (`node-postgres`) | 0.45.2 | Typed SQL, schema |
| Migrations | `drizzle-kit` | 0.31.10 | `drizzle-kit push` |
| Auth | `bcryptjs` | ^3.0.3 | Password hashing (cost 10) |
| PDF text | `unpdf` (bundled PDF.js) | ^1.9.1 | Per-page PDF extraction |
| DOCX text | `mammoth` | ^1.13.0 | OOXML → raw text |
| CSV | `papaparse` | ^5.7.1 | RFC 4180 parsing |
| Tests | `vitest` | ^5.1.0 | Unit tests |
| Test fixtures | `jszip` | ^3.10.2 | Builds a real DOCX in tests |

Supporting config: `next.config.ts` (defaults), `postcss.config.mjs`, `eslint.config.mjs`, `drizzle.config.json`, `vitest.config.ts`.

---

## 3. Repository structure

```
.
├── .env.example                 # documented environment variables (no secrets)
├── drizzle.config.json          # drizzle-kit schema + local DB credentials
├── next.config.ts               # default Next config
├── package.json                 # scripts & dependencies
├── tsconfig.json                # strict TS, "@/..." path alias, excludes tests
├── vitest.config.ts             # node env, tests/**/*.test.ts
├── tests/
│   ├── extraction.test.ts       # real PDF/DOCX/TXT extraction + attribution
│   ├── auth.test.ts             # bcrypt hash/verify/salt behaviour
│   └── csv.test.ts              # RFC 4180 parsing, dates, defaults, dedupe
└── src/
    ├── app/
    │   ├── layout.tsx           # wraps the app in StoreProvider
    │   ├── globals.css          # Tailwind import + navy/soft theme + animations
    │   ├── page.tsx             # public landing page
    │   ├── login/page.tsx       # sign in (demo credentials prefilled)
    │   ├── signup/page.tsx      # create account
    │   ├── (app)/               # authenticated shell (sidebar + topbar)
    │   │   ├── layout.tsx       # session gate, nav, toasts
    │   │   ├── dashboard/page.tsx
    │   │   ├── cases/page.tsx
    │   │   ├── cases/new/page.tsx
    │   │   ├── cases/[id]/page.tsx   # the core workflow page
    │   │   ├── upload/page.tsx
    │   │   ├── integrations/page.tsx
    │   │   ├── evaluation/page.tsx
    │   │   └── audit/page.tsx
    │   └── api/
    │       ├── auth/route.ts            # GET session, POST login/signup/logout
    │       ├── cases/route.ts           # GET list, POST create/bulk import
    │       ├── cases/[id]/route.ts      # PATCH update, DELETE
    │       ├── documents/route.ts       # GET (?caseId), POST
    │       ├── extractions/route.ts     # GET (?caseId), POST, DELETE (?caseId)
    │       ├── recommendations/route.ts # GET, POST
    │       ├── recommendations/[id]/route.ts # PATCH
    │       ├── audit/route.ts           # GET, POST
    │       ├── extract/route.ts         # POST multipart file → text
    │       ├── analyze/route.ts         # POST text → LLM JSON or demo marker
    │       ├── seed/route.ts            # POST seed (reset=1 requires auth)
    │       └── health/route.ts          # GET DB ping
    ├── components/
    │   └── ui.tsx               # Card, Badge, StatusBadge, Btn, ConfidenceBar,
    │                            # Field, EmptyState, banners, Logo, helpers
    ├── db/
    │   ├── index.ts             # pooled Drizzle client (DATABASE_URL)
    │   └── schema.ts            # users, cases, documents, extractions,
    │                            # recommendations, sessions, audit_logs
    └── lib/
        ├── core.ts              # domain types, demo dataset, required-doc
        │                        # checklists, runAnalysis engine, EVALUATION
        ├── store.tsx            # client store; all CRUD via API; session restore
        ├── auth-server.ts       # session create/destroy/read, requireUser, demo user
        ├── password.ts          # bcrypt hash/verify wrappers
        ├── extract.ts           # server-side PDF/DOCX/TXT/CSV/MD extraction
        └── csv.ts               # PapaParse parsing, row→case mapping, dedupe
```

---

## 4. Architecture overview

```
Browser (React client components)
│  StoreProvider  ── state: user, cases, docs, extractions, recs, audit, toast
│        │ fetch (credentials: same-origin, httpOnly cookie)
▼        ▼
Next.js API routes (Node runtime, server-side only)
│  auth-server.requireUser()  → 401 if no valid session
│  Drizzle ORM  →  PostgreSQL (users, cases, documents, extractions,
│                            recommendations, sessions, audit_logs)
│  extract.ts   →  unpdf / mammoth
│  analyze route → external LLM (only when LLM_API_KEY is set)
▼
PostgreSQL
```

Key rules:
* **No case data or credentials in localStorage.** The only client storage is React state.
* **All data access is server-mediated.** The client never touches PostgreSQL directly.
* **Parsing happens on the server**, so large binaries never need browser APIs.
* **Both analysis paths return the same shape,** so review/audit code is shared.

---

## 5. Data model (summary)

Detailed column lists are in `ARCHITECTURE.md` §3.

| Table | Purpose | Important columns |
|-------|---------|-------------------|
| `users` | Accounts | `email` (unique), `name`, `password` (bcrypt hash), `role` |
| `sessions` | Server sessions | `user_id`, `token_hash` (unique), `expires_at` |
| `cases` | Matters | `case_number` (unique), `title`, `client_name`, `case_type`, `status`, `priority`, `assigned_to` |
| `documents` | Uploaded files' text | `case_id`, `name`, `type`, `size`, `status`, `extracted_text`, `source`, `page_count` |
| `extractions` | Source-linked facts | `case_id`, `document_id`, `field_name`, `field_value`, `confidence`, `source_doc`, `source_page`, `source_snippet`, `category` |
| `recommendations` | Explainable suggestions | `case_id`, `title`, `summary`, `reasoning`, `confidence`, `status`, `evidence` (jsonb), `missing_info`, `uncertainties`, `next_steps`, `reviewed_by`, `review_comment`, `reviewed_at` |
| `audit_logs` | History | `case_id`, `actor`, `action`, `details`, `category`, `timestamp` |

Status vocabularies:
* Case: `awaiting_review` · `in_progress` · `completed` · `missing_docs` · `flagged`
* Recommendation: `pending` · `approved` · `rejected` · `modified`
* Document: `uploaded` · `processing` · `processed` · `failed`

---

## 6. Completed modules and features

### 6.1 Public site — `src/app/page.tsx`
Hero with product statement, six feature cards, four-step workflow, safety/guardrails section, team/about section, CTA. Links to `/login` and `/signup`.

### 6.2 Authentication — `src/app/login`, `src/app/signup`, `src/app/api/auth`, `src/lib/password.ts`, `src/lib/auth-server.ts`
* Sign-up inserts a user with a bcrypt hash (cost 10); sign-in verifies the hash.
* A session row stores only `sha256(random 32 bytes)`; the raw token is set in the `cc_session` cookie (`httpOnly`, `sameSite=lax`, `secure` in production, 7-day expiry).
* `POST /api/auth` also supports `action: "logout"`, deleting the session row and cookie.
* `GET /api/auth` returns the current user or `401`.
* `ensureDemoUser()` creates `demo@caseclarity.ai` / `demo1234` with a hashed password on first login attempt.
* The authenticated shell shows a "Sign in required" card when no session exists (client-side gate); APIs independently enforce `401`.

### 6.3 Authenticated shell — `src/app/(app)/layout.tsx`
Left navigation (Dashboard, Cases, Upload Documents, Integrations, Evaluation, Audit Trail), New Case CTA, demo-mode notice, user block with sign-out and "Reset demo data" (`POST /api/seed?reset=1`), mobile drawer, topbar with demo badge, and a global toast renderer.

### 6.4 Dashboard — `src/app/(app)/dashboard/page.tsx`
Total cases, awaiting review, completed, missing documents; "Cases by Status" bars; "Needs Your Review" pending recommendations; recent cases; recent activity (last 6 audit entries); document/recommendation/audit totals; Demo Mode and Safety banners.

### 6.5 Cases list — `src/app/(app)/cases/page.tsx`
Card grid with case number, priority dot, title, client, type, description, completeness bar, status, created date, assignee. Search across title/client/number, status and type filters, empty state, CSV export.

### 6.6 New case — `src/app/(app)/cases/new/page.tsx`
Title, client name, case type (7 options), priority, description; posts to `/api/cases`; logs "Case created"; redirects to the new case.

### 6.7 Case detail — `src/app/(app)/cases/[id]/page.tsx` (core workflow)
Header with status, priority, case number, client, assignee; actions for upload, analysis, document request, and flagging.
* **Overview** — summary, completeness, required-document checklist computed from `REQUIRED_DOCS`, recent activity, quick actions.
* **Documents** — list with type/size/page count/status, extracted-text preview, download extracted text, drag-and-drop upload through `/api/extract`.
* **Analysis** — extracted-fact table (field, value, confidence, source document, page, snippet), missing-information list, contradiction list, "Run AI Analysis".
* **Recommendation** — title, summary, reasoning, confidence bar, evidence cards (document + page + quote), missing information, uncertainties, next steps; reviewer comment field; Approve / Modify / Save Modification / Reject / Request Documents.
* **Human Review** — review-category audit entries for this case.
* **Audit** — full per-case timeline with color-coded categories.

### 6.8 Upload — `src/app/(app)/upload/page.tsx`
Case selector, drag-and-drop/browse, per-file processing queue, real extraction via `/api/extract`, audit logging, and links into the case.

### 6.9 Integrations — `src/app/(app)/integrations/page.tsx`
* **Google Drive (Simulated)** — five fictional files; "Import" attaches a placeholder document with `source: "Google Drive (simulated)"` to the first case; label + note explain no live connection exists.
* **CSV import (functional)** — file input → PapaParse → `buildCasesFromRows` → `POST /api/cases` bulk import with server-side dedupe; report card shows rows read, added, duplicates skipped, and warnings (missing columns, incomplete rows, mixed date formats, parse errors).
* **CSV export / sample CSV** — client-generated downloads; export is audit-logged.
* **Integration principles** card documents labeling, reporting, and audit expectations.

### 6.10 Evaluation — `src/app/(app)/evaluation/page.tsx`
Four comparison metrics (manual vs. AI-assisted) rendered as bars, an explicit "illustrative placeholders" notice, a three-step plan for replacing them with real results, and a workspace-totals card (currently hardcoded values, see §11).

### 6.11 Audit trail — `src/app/(app)/audit/page.tsx`
Chronological event list with actor, action, details, category chips, and per-case links; supports filtering/reading of all recorded events.

### 6.12 Analysis engine — `src/lib/core.ts`
* `REQUIRED_DOCS` per case type (7 types) drives the completeness checklist.
* `runAnalysis(case, docs)` splits each document's `extractedText` on `\f` into pages, then walks **each page of each document**, creating facts for the first capitalized name pair, up to three month-name dates, and up to three `$` amounts. Every fact stores `documentId`, `sourceDoc` (filename), `sourcePage`, and a ±30-character snippet.
* Contradictions: monetary values whose maximum−minimum exceeds 2000, and a "position elimination" vs "refilled"/"accommodation" textual conflict.
* Missing documents: required-doc names whose first word is absent from filenames and full text.
* Recommendation selection: ≥3 missing → "request documents" (confidence 90); contradictions → "investigate" (74); otherwise "proceed" (86). Uncertainties always include the uncalibrated-heuristic disclaimer.
* Seeds: 6 fictional cases, 15 documents, 20 extractions, 6 recommendations, 14 audit entries; `EVALUATION` illustrative metrics; `DRIVE_FILES` simulated listing.

### 6.13 API surface
See `ARCHITECTURE.md` §4 for full request/response detail. Summary:

| Endpoint | Methods | Auth |
|----------|---------|------|
| `/api/health` | GET | Public (DB ping) |
| `/api/auth` | GET, POST | GET returns user or 401; POST is the auth entry point |
| `/api/cases` | GET, POST | Required |
| `/api/cases/[id]` | PATCH, DELETE | Required |
| `/api/documents` | GET, POST | Required |
| `/api/extractions` | GET, POST, DELETE | Required |
| `/api/recommendations` | GET, POST | Required |
| `/api/recommendations/[id]` | PATCH | Required |
| `/api/audit` | GET, POST | Required |
| `/api/extract` | POST | Required |
| `/api/analyze` | POST | Required |
| `/api/seed` | POST | Seeding is public **only while the DB is empty**; `?reset=1` requires auth |

### 6.14 Tests — `tests/`
`npx vitest run` → **3 files, 14 tests, all passing.**
* `extraction.test.ts` — generates a real minimal PDF and a real DOCX (via JSZip), asserts extracted text/page count; asserts every fact is attributed to the correct document and page; asserts evidence has document/page/snippet.
* `auth.test.ts` — bcrypt hashes differ from plaintext, verify correct/incorrect passwords, salted duplicates.
* `csv.test.ts` — quoted commas, mixed date formats, missing columns/defaults, duplicate detection.

---

## 7. Demo credentials and seed data

| Item | Value |
|------|-------|
| Demo email | `demo@caseclarity.ai` |
| Demo password | `demo1234` |
| Seeding | Automatic from the client on first authenticated load if `cases` is empty (`POST /api/seed`), or manually |
| Reset | Sidebar "Reset demo data" → `POST /api/seed?reset=1` (requires auth; deletes and re-seeds demo rows) |

Demo dataset scenarios:
* **Complete case** — CC-2026-001 Maria Gonzalez (eviction defense) with 5 documents and no missing items.
* **Missing documents** — CC-2026-002 James Carter (SNAP appeal) with only the denial letter.
* **Contradictory information** — CC-2026-003 Aisha Thompson (employment) with conflicting salary figures and a termination/re-fill inconsistency.

All data is fictional.

---

## 8. Setup instructions

### Prerequisites
* Node.js 20+ and npm
* A reachable PostgreSQL instance

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Create `.env` (or `.env.local`) in the project root:
```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
# Optional — enables real LLM analysis:
# LLM_API_KEY=sk-...
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4o-mini
```
`.env.example` documents these names. **Do not commit real secrets.**

### 3. Apply the schema
```bash
npx drizzle-kit push
```
This reads `drizzle.config.json` (schema at `./src/db/schema.ts`). Note: that config currently hardcodes the local connection string; update it if your database URL differs.

### 4. Run
```bash
npm run dev          # development at http://localhost:3000
```
Open `/`, then sign in with the demo account or via Google Drive-free sign-up. The demo data seeds automatically.

### 5. Production build
```bash
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
npm run start
```

### 6. Tests
```bash
npx vitest run       # 14 unit tests
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

---

## 9. Environment variables

| Variable | Required | Used by | Notes |
|----------|----------|---------|-------|
| `DATABASE_URL` | ✅ Yes | `src/db/index.ts` | Pooled node-postgres connection. App throws at startup without it. |
| `LLM_API_KEY` | ⬜ Optional | `POST /api/analyze` | Server-only. Absent → endpoint returns `mode: "demo"`; the client then uses the local engine. |
| `LLM_BASE_URL` | ⬜ Optional | `POST /api/analyze` | Defaults to `https://api.openai.com/v1`. Any OpenAI-compatible endpoint works. |
| `LLM_MODEL` | ⬜ Optional | `POST /api/analyze` | Defaults to `gpt-4o-mini`. |

> **Configuration gap (verified):** the repository's `.env.local` currently defines `OPENAI_API_KEY` / `OPENAI_MODEL`, but the API route reads **`LLM_API_KEY` / `LLM_MODEL`**. As things stand, live analysis will not activate until one of those is mapped (set `LLM_API_KEY`, or update the route to read the existing name). This is documented, not silently changed, because application code must not be modified during documentation work.

---

## 10. Important dependencies and why they exist

| Dependency | Why it is here | If you replace it |
|------------|----------------|-------------------|
| `next`, `react`, `react-dom` | App Router UI and server routes | Would require a full routing rewrite. |
| `drizzle-orm`, `pg`, `drizzle-kit` | Typed schema, queries, schema push | Keep `src/db/schema.ts` as the single source of truth. |
| `bcryptjs` | Password hashing without native build steps | Any replacement must stay a slow, salted hash (not SHA-256). |
| `unpdf` | PDF text extraction (bundled PDF.js) in Node | Must preserve per-page output joining with `\f`. |
| `mammoth` | DOCX → raw text | Alternative must return plain text. |
| `papaparse` | RFC 4180 CSV parsing | Do not regress to `split(",")`. |
| `lucide-react` | Icons used across the UI | Purely visual. |
| `vitest`, `jszip` | Unit tests and DOCX fixture creation | Keep tests runnable with `npx vitest run`. |

---

## 11. Known gaps and remaining work

Prioritized and verified against the current code. **These are intentionally documented rather than fixed here, because documentation work must not alter application behaviour.**

### High
1. **`completeness` is not persisted.** It exists in the `CaseItem` type, the seed payload, the case-detail PATCH allowlist, and the UI, but there is no `completeness` column on `cases`. Drizzle's update builder iterates **table columns**, so an unknown `completeness` key is silently ignored (no error). Result: API-returned cases have `completeness === undefined`, so case cards can render `undefined%` and an empty progress bar after a reload. Fix = add the column + migration, or compute it on the client from documents.
2. **Live LLM key name mismatch** (see §9). Either map `OPENAI_API_KEY` → `LLM_API_KEY` at deploy time or update `src/app/api/analyze/route.ts`.
3. **Single shared workspace.** APIs check *authentication* but not *ownership*; any signed-in user sees all cases. Add `owner_id`/`org_id` scoping and filter every query before claiming multi-tenant isolation.

### Medium
4. **Approving a recommendation does not update the case status.** `review()` updates the recommendation and writes audit entries but never calls `updateCase`; the "Completed" dashboard count therefore does not change on approval. (The demo analysis path does set `missing_docs` / `flagged` / `awaiting_review`.)
5. **Evaluation totals are hardcoded** (`6 / 15 / 20 / 6`) while the card claims "Live counts"; metrics themselves are static and not tied to a persisted evaluation record.
6. **CSV export is hand-rolled** on the client (manual quote doubling) in both Cases and Integrations. No server export endpoint, no formula-injection prefix guard, and no RFC-compliant edge-case coverage matching the import parser.
7. **Google Drive import targets `cases[0]`** rather than a case the user selects, and inserts placeholder text rather than a real file.
8. **No OCR.** Image-only PDFs return little or no text; `extract.ts` surfaces a warning but the UI cannot recover the content.
9. **Original binaries are not stored** — only extracted text. "Download extracted text" is available; original-file download is not.
10. **Required-document matching is heuristic.** Both the case page and `runAnalysis` match required names against filenames/text by first word, which can produce false positives/negatives.
11. **Audit writes are optimistic/fire-and-forget** from the client (`POST /api/audit` errors are swallowed); a failed write leaves a toast-only entry in memory until reload.
12. **Sidebar case-count badge (`6`) and notification badge (`3`) are hardcoded.**

### Low / hardening
13. **No rate limiting, account lockout, or CSRF tokens.** Sessions use `sameSite=lax` and cookies are httpOnly, but state-changing routes have no origin/CSRF check.
14. **No middleware** for route protection; the `(app)` layout gates in the browser and APIs return 401. Consider `middleware.ts` for defense in depth.
15. **Foreign keys have no `ON DELETE CASCADE`.** `DELETE /api/cases/[id]` can fail if documents/extractions/recommendations/audit rows reference the case.
16. **Case-number generation is read-then-write** (`max + 1`), which can collide under concurrent creates.
17. **Demo credentials are documented and prefilled on `/login`** — acceptable for a judged prototype, must be removed/gated before any real deployment.
18. **No API or end-to-end tests.** Current tests cover pure library functions only (extraction, attribution, hashing, CSV).
19. **No encryption at rest** for stored extracted text; do not store real client data.

---

## 12. Coding conventions

### Language and types
* TypeScript strict mode everywhere; avoid `any`. When parsing external JSON (LLM responses, CSV rows), validate shape before use.
* Domain types live in `src/lib/core.ts` (`CaseItem`, `DocItem`, `Extraction`, `Recommendation`, `AuditEntry`, `User`). Change them there first, then follow compiler errors.
* DB types come from Drizzle inference (`typeof cases.$inferSelect`). Keep field names consistent with the client model (snake_case in PostgreSQL, camelCase in Drizzle/TS).

### Client/server boundaries
* Add `"use client"` only to components using hooks, state, or browser APIs.
* Never import `src/db`, `src/lib/auth-server.ts`, `src/lib/password.ts`, or `src/lib/extract.ts` from a client component.
* Secrets must be read via `process.env` in route handlers only; never prefix with `NEXT_PUBLIC_`.

### API conventions
* Every data route starts with `const user = await requireUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`
* Export `const dynamic = "force-dynamic"` on routes that must not be cached.
* PATCH handlers use an explicit allowlist of updatable fields; never spread an untrusted body into `.set()`.
* Return predictable envelopes: `{ cases }`, `{ documents }`, `{ extractions }`, `{ recommendations }`, `{ audit }`, `{ case }`, `{ error }`.
* Validate sizes/inputs at the boundary (e.g. 10 MB upload cap) and return meaningful status codes.

### UI conventions
* Reuse primitives from `src/components/ui.tsx` (`Card`, `Badge`, `StatusBadge`, `Btn`, `ConfidenceBar`, `EmptyState`, `DemoBanner`, `SafetyBanner`, `Field`, `inputCls`, `PriorityDot`).
* Palette: navy `#0f2043` (primary), `#1e3a5f` (hover), blue `#2563eb` (accent), canvas `#f6f8fb`; use the Tailwind theme tokens in `src/app/globals.css` where possible.
* Layout: `rounded-2xl` cards, `border-slate-200/80`, soft shadows, `animate-fadeUp` for page entry, responsive grids (`sm:`/`lg:`/`xl:`).
* Every AI surface must show provenance (document + page) and an uncertainty or demo label where applicable.
* Use toasts (`notify`) for feedback, not `alert()` — sandboxed previews can block native dialogs.

### Data-integrity conventions
* Re-running analysis must **replace** a case's extractions (`DELETE /api/extractions?caseId=…` then insert), never duplicate them.
* Log a meaningful audit entry for every state-changing action, with a category of `case`, `document`, `ai`, `review`, `integration`, or `system`.
* Never present an LLM/demo interpretation as a verified fact; keep `sourceSnippet` attached to every extracted field.

---

## 13. Guidelines for changing the code without breaking it

**Before you start**
1. Read this file plus `ARCHITECTURE.md`.
2. Identify whether the change touches the client store contract, the DB schema, or both.
3. Keep the UI's existing labels for simulated/demo features truthful.

**Adding a page**
1. Put authenticated pages under `src/app/(app)/…` and add the route to `NAV` in `src/app/(app)/layout.tsx` if it belongs in the sidebar.
2. Read data through `useStore()`; add a fetch only via a new authenticated API route.
3. Verify mobile layout (drawer nav, table overflow) at 390 px width.

**Adding a database field**
1. Edit `src/db/schema.ts`, then run `npx drizzle-kit push`.
2. Update the matching domain type in `src/lib/core.ts`.
3. Add the field to the API allowlist (`PATCH` handlers) and to the seed route if demo data needs it.
4. Confirm the API actually returns it — remember that Drizzle silently ignores unknown keys, so a type-only field will look present but never persist (this is exactly how the `completeness` gap arose).

**Adding an API route**
1. Require a session; scope queries by owner once ownership exists.
2. Validate inputs; cap payload sizes; return `{ error }` with a correct status.
3. Add or update the store method in `src/lib/store.tsx`, keeping optimistic updates consistent with server responses.

**Changing analysis behaviour**
1. Preserve the `{ extractions, recommendation, contradictions, missing, summary }` return shape.
2. Keep per-document/per-page attribution; never attach all facts to the first document.
3. If you touch the LLM prompt or response contract, update the TypeScript shape checks in `cases/[id]/page.tsx` and the demo fallback in `runAnalysis`.
4. Add a test in `tests/extraction.test.ts` for any new extraction rule.

**Changing authentication**
1. Keep passwords out of the client and out of plaintext columns.
2. Keep the raw session token out of the database (hash only).
3. Update `requireUser` consumers if the session shape changes; run the auth tests.

**Before opening a PR**
```bash
npx vitest run
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
```
Then manually verify: sign in → upload a PDF → run analysis → check page-level citations → modify/approve → confirm audit entries → import a CSV with a duplicate row.

**Do not**
* Store credentials or case data in `localStorage`.
* Present demo/simulated results as measured outcomes.
* Allow an AI action to set a final case outcome without a human decision.
* Bypass the API and query PostgreSQL from a client component.

---

## 14. Documentation map

| File | Audience | Contents |
|------|----------|----------|
| `PROBLEM_STATEMENT.md` | Product, judges, new teammates | Original brief, problem analysis, personas, solution, approach, features, scope, success criteria, risks |
| `CONTEXT.md` (this file) | All contributors | Status, stack, structure, modules, setup, env vars, dependencies, conventions, change guidelines, known gaps |
| `ARCHITECTURE.md` | Engineers | System flows, full schema, API contracts, auth/security model, extraction and analysis pipelines, testing, decision log, extension playbooks |
