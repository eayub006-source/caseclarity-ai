# CaseClarity AI — Project Context

> **What this file is:** the single place to understand what has been built so far, how the project is structured, which technologies it uses, what works, what is simulated, and what is left to do.
>
> It was written after a full review of the source code, the database and the test suite. **The code is the source of truth** — if this document and the code ever disagree, trust the code and update this document.

| | |
|---|---|
| **Product** | CaseClarity AI — explainable, human-in-the-loop AI case management for small legal-aid nonprofits |
| **Team · Event** | HACKSMITHS · Build for Campus 2026 |
| **Stage** | Working full-stack hackathon prototype |
| **Last reviewed** | 2026-11-15 |
| **Companion docs** | [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md) (problem and solution) · [AGENTS.md](./AGENTS.md) (setup, conventions, rules for changing code) |

## Contents

1. [Snapshot](#1-snapshot)
2. [Feature status](#2-feature-status)
3. [Tech stack](#3-tech-stack)
4. [Architecture](#4-architecture)
5. [Project structure](#5-project-structure)
6. [Data model](#6-data-model)
7. [API reference](#7-api-reference)
8. [Authentication & security](#8-authentication--security)
9. [AI analysis pipeline](#9-ai-analysis-pipeline)
10. [Pages & modules](#10-pages--modules)
11. [Demo data](#11-demo-data)
12. [Integrations](#12-integrations)
13. [Testing & validation](#13-testing--validation)
14. [Configuration & environment variables](#14-configuration--environment-variables)
15. [What is simulated](#15-what-is-simulated)
16. [Known issues & limitations](#16-known-issues--limitations)
17. [Remaining work](#17-remaining-work)
18. [Development history](#18-development-history)

---

## 1. Snapshot

- **What it does:** helps case workers turn long, inconsistent case documents into structured facts and an *explainable* recommendation. Each recommendation shows its reasoning, supporting evidence with document and page citations, a confidence indicator explicitly labeled as uncalibrated, missing information, uncertainties and suggested next steps.
- **Core rule:** the AI never makes a final legal decision. Every recommendation waits for a human to approve, modify or reject it, and every action is written to a persistent audit trail.
- **End-to-end workflow (working):** upload → text extraction → analysis → explainable recommendation → human review → audit trail.
- **Data:** fictional demo data only — 6 cases, 15 documents, 20 extracted facts, 6 recommendations, 14 audit events, seeded into PostgreSQL on first login.
- **Demo account:** `demo@caseclarity.ai` / `demo1234` — created automatically (bcrypt-hashed) the first time anyone logs in.
- **AI mode:** no `LLM_API_KEY` is configured in the current environment, so analysis runs in clearly labeled **Demo Mode** (a deterministic, rule-based engine). The LLM path is implemented server-side but has not yet been exercised with a live key.

**Quality gates at last review:** 14/14 Vitest tests pass · `next typegen` ✓ · `tsc --noEmit` ✓ · `eslint .` ✓ (0 problems) · `next build` ✓ · `GET /api/health` → `{"ok":true}`.

---

## 2. Feature status

**Legend:** ✅ implemented and working · 🟡 working, with documented limitations · 🧪 simulated, and labeled as such in the UI · ⛔ not implemented. `KI-n` refers to [Known issues](#16-known-issues--limitations).

| Area | Status | Notes |
|---|---|---|
| Landing page | ✅ | Hero, feature highlights, how it works, safety, about, footer |
| Sign-up, sign-in, sign-out, demo account | ✅ | bcrypt password hashes; server-side sessions in an httpOnly cookie |
| Dashboard | ✅ 🟡 | Stats, status chart, review queue, quick actions; "recent" lists are oldest-first after a reload (KI-2) |
| Cases: create, list, search, filter, detail | ✅ 🟡 | Completeness value is not persisted (KI-1) |
| Document upload with real text extraction | ✅ | PDF (per page), DOCX, TXT, CSV, MD; 10 MB limit; no OCR (KI-10) |
| Analysis — demo engine | 🟡 | Deterministic heuristics with per-document, per-page attribution (KI-5, KI-6, KI-7) |
| Analysis — LLM backend | 🟡 | Implemented, key stays on the server; not verified with a live key (KI-8) |
| Per-document narrative summaries | ⛔ | Analysis produces a case-level summary line and recommendation text only |
| Explainable recommendations | ✅ | All eight required elements are displayed (§9.6) |
| Human review | ✅ | Approve, modify (text required), reject, comment, request documents, flag; all audit-logged |
| Audit trail | ✅ 🟡 | Global and per case, search, category filter, CSV export (KI-2, KI-14) |
| CSV import / export | ✅ 🟡 | RFC 4180 import with a validation report; export quoting bug (KI-3, KI-12) |
| Google Drive import | 🧪 | Labeled "Simulated"; no OAuth or Drive API (KI-13) |
| Evaluation page | 🟡 | Illustrative placeholder metrics, clearly labeled; totals hardcoded (KI-4) |
| PostgreSQL persistence | ✅ | All data flows through authenticated API routes |
| API authentication | ✅ | Every data route returns 401 without a valid session |
| Role / ownership authorization | ⛔ | Any signed-in user can read and change all records (KI-14) |
| Automated tests | ✅ 🟡 | 14 unit tests; no API-route or end-to-end UI tests yet |

---

## 3. Tech stack

| Layer | Technology | Version (package.json) | Used for |
|---|---|---|---|
| Framework | Next.js (App Router; Turbopack builds) | 16.4.6 | Pages and the Route Handler backend |
| UI library | React / React DOM | 19.2.6 | Client components |
| Language | TypeScript (strict mode) | 5.9.3 | Entire codebase |
| Styling | Tailwind CSS v4 + `@tailwindcss/postcss` | 4.1.17 | Utility-first styling |
| Icons | lucide-react | ^1.73.0 | All icons |
| Database | PostgreSQL | 15 (tested on 15.19) | Persistence |
| DB driver | pg | 8.20.0 | Connection pool |
| ORM / schema tool | drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | Queries, schema, `drizzle-kit push` |
| PDF extraction | unpdf (bundles Mozilla PDF.js) | ^1.9.1 | Per-page PDF text |
| DOCX extraction | mammoth | ^1.13.0 | DOCX raw text |
| CSV | papaparse | ^5.7.1 | RFC 4180 parsing |
| Password hashing | bcryptjs | ^3.0.3 | bcrypt, cost factor 10 |
| Tests | vitest | ^5.1.0 | Unit tests |
| Test fixtures | jszip | ^3.10.2 | Builds DOCX files inside tests only |
| Linting | ESLint + eslint-config-next | 9.39.4 / 16.4.6 | `next/core-web-vitals` rules |
| LLM (optional) | Any OpenAI-compatible Chat Completions API | default model `gpt-4o-mini` | `/api/analyze` |
| Other | dotenv | 17.3.1 | Present from the starter template; not imported by application code (Next.js loads `.env` itself) |

Runtime: Node.js 22 (developed and tested on v22.23.4) with npm 10.

**Notes**

- The brief allowed "Python/FastAPI **or an equivalent backend**". We use **Next.js Route Handlers (Node.js runtime)** as the backend: one TypeScript codebase serves the UI, the REST API, document extraction and the LLM proxy.
- `vitest`, `jszip`, `@types/bcryptjs` and `@types/papaparse` are listed under `dependencies` rather than `devDependencies`. There is no `npm test` script — run `npx vitest run`.
- `globals.css` lists `Inter` first in the font stack, but no web font is loaded (no `next/font`), so browsers use the system UI font unless Inter is installed locally.

---

## 4. Architecture

```mermaid
flowchart LR
  subgraph Browser["Browser — client components"]
    UI["Pages: landing, auth, workspace"]
    Store["StoreProvider<br/>src/lib/store.tsx"]
    Demo["Demo engine runAnalysis()<br/>src/lib/core.ts"]
  end
  subgraph Server["Next.js server — Route Handlers (Node.js)"]
    Auth["/api/auth<br/>sessions + bcrypt"]
    Data["/api/cases, documents,<br/>extractions, recommendations, audit"]
    Extract["/api/extract<br/>unpdf + mammoth"]
    Analyze["/api/analyze<br/>LLM proxy"]
    Seed["/api/seed"]
    Health["/api/health"]
  end
  DB[("PostgreSQL<br/>via Drizzle ORM")]
  LLM["OpenAI-compatible LLM API<br/>(only if LLM_API_KEY is set)"]
  UI --> Store
  Store -->|"fetch + cc_session cookie"| Auth
  Store --> Data
  UI -->|"multipart file"| Extract
  UI -->|"case text"| Analyze
  UI -->|"fallback when mode = demo"| Demo
  Auth --> DB
  Data --> DB
  Seed --> DB
  Health --> DB
  Analyze --> LLM
```

### Key design decisions

1. **Client-rendered app, server-side data.** All pages are client components (`"use client"`). The root layout (a server component) wraps the app in `StoreProvider`, which is the single client gateway for data reads and writes. Two calls bypass the store: `/api/extract` (multipart upload) and `/api/analyze`, which the upload and case pages call directly.
2. **Route Handlers are the backend.** Every data route starts with `requireUser()` and returns `401` when there is no valid session.
3. **Two analysis modes.** `/api/analyze` returns `mode: "llm"` with structured JSON when `LLM_API_KEY` is set. Otherwise, or on any LLM error, it returns `mode: "demo"`, and the browser runs the deterministic `runAnalysis()` engine.
4. **Page-preserving extraction.** `/api/extract` joins PDF pages with a form-feed character (`\f`). The demo engine splits on `\f` to attribute each fact to its page. This is a contract between `src/lib/extract.ts` and `src/lib/core.ts`.
5. **Schema-first persistence.** Tables are defined in `src/db/schema.ts` and applied with `npx drizzle-kit push` (no migration files).
6. **Protection model.** Data is protected on the server (401 from the API). Workspace pages are guarded in the browser by `src/app/(app)/layout.tsx`, which shows "Sign in required" when there is no session. There is no Next.js middleware.

### Session and data-loading lifecycle

1. `POST /api/auth` `{action: "login"}` → bcrypt verification → a `sessions` row is created and the `cc_session` cookie is set.
2. The store runs `ensureSeed()`: `GET /api/cases`; if the table is empty it calls `POST /api/seed`.
3. The store runs `loadAll()`: `GET` cases, documents, extractions, recommendations and audit entries in parallel.
4. On a page refresh, `GET /api/auth` restores the user from the cookie before the workspace renders (the `ready` flag).

---

## 5. Project structure

```
.
├── .env                        # local configuration (DATABASE_URL) — never commit
├── .env.example                # documented variables: DATABASE_URL, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
├── .gitignore                  # excludes node_modules/, .next/, .env, build caches, logs
├── drizzle.config.json         # drizzle-kit config (dialect, schema path, hardcoded DB URL)
├── eslint.config.mjs           # ESLint flat config: next/core-web-vitals
├── next.config.ts              # Next.js config (defaults)
├── next-env.d.ts               # generated by Next.js
├── package.json                # scripts: dev, build, start, lint, typecheck
├── package-lock.json
├── postcss.config.mjs          # Tailwind v4 PostCSS plugin
├── tsconfig.json               # strict TS, "@/*" → "src/*", excludes tests/ and vitest.config.ts
├── vitest.config.ts            # node environment, tests/**/*.test.ts, 30 s timeout
├── tests/
│   ├── auth.test.ts            # bcrypt hashing (4 tests)
│   ├── csv.test.ts             # CSV parsing, dates, missing columns, dedupe (4 tests)
│   └── extraction.test.ts      # real PDF/DOCX/TXT extraction + evidence attribution (6 tests)
└── src/
    ├── app/
    │   ├── layout.tsx          # root layout (server component): metadata + <StoreProvider>
    │   ├── globals.css         # Tailwind import, @theme colour tokens, animations, scrollbar
    │   ├── page.tsx            # public landing page
    │   ├── login/page.tsx      # sign-in
    │   ├── signup/page.tsx     # account creation
    │   ├── (app)/              # authenticated workspace (route group — not part of the URL)
    │   │   ├── layout.tsx      # sidebar, top bar, auth gate, toasts
    │   │   ├── dashboard/page.tsx
    │   │   ├── cases/page.tsx              # list, search, filters, CSV export
    │   │   ├── cases/new/page.tsx          # create a case
    │   │   ├── cases/[id]/page.tsx         # case workspace: 6 tabs, analysis, human review
    │   │   ├── upload/page.tsx             # upload documents to any case
    │   │   ├── integrations/page.tsx       # Google Drive (simulated), CSV import/export
    │   │   ├── evaluation/page.tsx         # illustrative performance metrics
    │   │   └── audit/page.tsx              # global audit trail
    │   └── api/
    │       ├── health/route.ts             # GET — DB health check (public)
    │       ├── auth/route.ts               # GET/POST — session, login, signup, logout
    │       ├── seed/route.ts               # POST — seed / reset fictional data
    │       ├── cases/route.ts              # GET/POST — list, create, bulk import
    │       ├── cases/[id]/route.ts         # PATCH/DELETE
    │       ├── documents/route.ts          # GET/POST
    │       ├── extract/route.ts            # POST — real text extraction (multipart)
    │       ├── extractions/route.ts        # GET/POST/DELETE — extracted facts
    │       ├── recommendations/route.ts    # GET/POST
    │       ├── recommendations/[id]/route.ts  # PATCH — review decisions
    │       ├── analyze/route.ts            # POST — LLM analysis or demo-mode signal
    │       └── audit/route.ts              # GET/POST — audit trail
    ├── components/
    │   └── ui.tsx              # design-system primitives (Card, Btn, Badge, StatusBadge, …)
    ├── db/
    │   ├── index.ts            # pg Pool + Drizzle client (requires DATABASE_URL)
    │   └── schema.ts           # 7 tables
    └── lib/
        ├── core.ts             # shared: domain types, constants, seed data, demo engine, formatters
        ├── csv.ts              # shared: RFC 4180 parsing, row → case mapping, dedupe
        ├── store.tsx           # client: React context store; all data calls to the API
        ├── extract.ts          # server: PDF/DOCX/TXT text extraction
        ├── auth-server.ts      # server: sessions, requireUser(), demo-user bootstrap
        └── password.ts         # server: bcrypt hash/verify
```

### Module boundaries

| Kind | Files | Rule |
|---|---|---|
| Shared (browser, server, tests) | `src/lib/core.ts`, `src/lib/csv.ts` | No Node-only or browser-only APIs |
| Server-only | `src/db/*`, `src/lib/auth-server.ts`, `src/lib/password.ts`, `src/lib/extract.ts` | Import only from `src/app/api/**` (they use `pg`, `next/headers`, Node `crypto`, `Buffer`, PDF parsing) |
| Client-only | `src/lib/store.tsx`, `src/components/ui.tsx`, every `page.tsx`, `src/app/(app)/layout.tsx` | Marked `"use client"` |

---

## 6. Data model

Seven tables are defined in `src/db/schema.ts`. Primary keys are UUIDs generated by the database.

```mermaid
erDiagram
  users ||--o{ sessions : "has"
  cases ||--o{ documents : "contains"
  cases ||--o{ extractions : "has"
  documents ||--o{ extractions : "source of"
  cases ||--o{ recommendations : "has"
  cases ||--o{ audit_logs : "logged in"
```

| Table | Columns | Notes |
|---|---|---|
| `users` | id, email (unique), name, password, role (default `case_worker`), created_at | `password` holds a bcrypt hash (`$2b$10$…`) |
| `sessions` | id, user_id → users, token_hash (unique), expires_at, created_at | Stores the SHA-256 of the session token, never the token itself |
| `cases` | id, case_number (unique), title, client_name, case_type, status, priority, description, assigned_to, created_at, updated_at | **No `completeness` column** (KI-1) |
| `documents` | id, case_id → cases, name, type, size, status, extracted_text, source, page_count, uploaded_at | Only extracted text is stored, not the original file |
| `extractions` | id, case_id → cases, document_id → documents, field_name, field_value, confidence, source_doc, source_page, source_snippet, category, created_at | One row per extracted fact, with provenance |
| `recommendations` | id, case_id → cases, title, summary, reasoning, confidence, status, evidence (jsonb), missing_info (jsonb), uncertainties (jsonb), next_steps (jsonb), reviewed_by, review_comment, created_at, reviewed_at | `evidence` is an array of `{claim, doc, page, snippet}` |
| `audit_logs` | id, case_id → cases (nullable), actor, action, details, category, timestamp | `case_id` is null for workspace-level events (CSV export, demo reset) |

**Vocabularies** (stored as strings, not database enums):

- Case status: `awaiting_review`, `in_progress`, `completed`, `missing_docs`, `flagged`
- Case priority: `low`, `medium`, `high`, `urgent`
- Recommendation status: `pending`, `approved`, `rejected`, `modified`
- Document status: `uploaded`, `processing`, `processed`, `failed`
- Audit category: `case`, `document`, `ai`, `review`, `integration`, `system` (database default `general`)
- Case types: Housing / Eviction, Benefits Appeal, Employment, Family Law, Immigration, Consumer Debt, Other. Each has a required-document checklist in `REQUIRED_DOCS` (`src/lib/core.ts`).

**Other notes**

- The TypeScript domain types in `src/lib/core.ts` (`CaseItem`, `DocItem`, `Extraction`, `Recommendation`, `AuditEntry`) mirror these tables. Dates travel as ISO strings in JSON.
- IDs from the client-side `uid()` helper are temporary. POST routes ignore them and the database assigns UUIDs.
- Foreign keys have no `ON DELETE CASCADE` (KI-15).

---

## 7. API reference

All routes live under `src/app/api/` and return JSON. **Session** means a valid `cc_session` cookie is required; without it the route returns `401 {"error":"Unauthorized"}`.

| Method and path | Auth | Request | Response / behavior |
|---|---|---|---|
| `GET /api/health` | none | — | `{"ok":true}`; `500 {"ok":false}` if the database query fails |
| `GET /api/auth` | session | — | `{user}`, or `200 {"user":null}` when signed out |
| `POST /api/auth` | none | `{action:"login", email, password}` | Ensures the demo user exists, verifies the bcrypt hash, creates a session and cookie → `{user}`; `400` missing fields, `401` bad credentials |
| `POST /api/auth` | none | `{action:"signup", name, email, password}` | Hashes the password, creates user and session → `201 {user}`; `409` if the email exists |
| `POST /api/auth` | none | `{action:"logout"}` | Deletes the session row and cookie → `{ok:true}` |
| `POST /api/seed` | none, or session for reset | optional `?reset=1` | Seeds fictional data only when `cases` is empty; `?reset=1` (session required) deletes all case data and re-seeds. Users and sessions are kept |
| `GET /api/cases` | session | — | `{cases}` ordered by `created_at` ascending |
| `POST /api/cases` | session | case fields | Creates a case numbered `CC-2026-NNN` (highest existing number + 1) → `201 {case}` |
| `POST /api/cases` | session | `{items: CaseItem[]}` | Bulk import with server-side dedupe (client + title, case-insensitive) → `{added, skipped, cases}` |
| `PATCH /api/cases/[id]` | session | whitelisted fields | title, clientName, caseType, status, priority, description, assignedTo, completeness¹ → `{case}`; `404` if not found |
| `DELETE /api/cases/[id]` | session | — | Deletes a case; fails when related rows exist (KI-15); not used by the UI |
| `GET /api/documents` | session | optional `?caseId=` | `{documents}` ordered by `uploaded_at` ascending |
| `POST /api/documents` | session | document fields | `201 {document}` |
| `POST /api/extract` | session | multipart field `file` | `{name, text, pageCount, type, warning?}`; `400` no file, `413` over 10 MB, `500` parse error |
| `GET /api/extractions` | session | optional `?caseId=` | `{extractions}` |
| `POST /api/extractions` | session | `{items: Extraction[]}` | Bulk insert → `201 {extractions}` |
| `DELETE /api/extractions` | session | `?caseId=` (required) | Deletes all facts for the case (used before re-analysis) |
| `GET /api/recommendations` | session | — | `{recommendations}` ordered by `created_at` ascending |
| `POST /api/recommendations` | session | recommendation fields | `201 {recommendation}` |
| `PATCH /api/recommendations/[id]` | session | whitelisted fields | Sets `reviewed_at` whenever `status` is sent → `{recommendation}` |
| `POST /api/analyze` | session | `{text}` | `{mode:"llm", model, result}`, or `{mode:"demo", disclaimer}` / `{mode:"demo", error}` |
| `GET /api/audit` | session | — | `{audit}` ordered by `timestamp` ascending |
| `POST /api/audit` | session | `{caseId?, action, details, category}` | Appends an entry; `actor` defaults to the session user → `201 {entry}` |

¹ `completeness` is accepted but silently dropped because the column does not exist (KI-1).

---

## 8. Authentication & security

**Implemented**

- **Password storage:** bcrypt via `bcryptjs`, cost factor 10 (`src/lib/password.ts`). Verified in the database: the demo user's password column starts with `$2b$10$`. No plaintext passwords are stored anywhere, and browser localStorage is no longer used for accounts or data.
- **Sessions:** a `crypto.randomBytes(32)` token (hex) in the `cc_session` cookie — `httpOnly`, `SameSite=Lax`, `Secure` in production, 7-day expiry. Only its SHA-256 hash is stored in `sessions` (`src/lib/auth-server.ts`).
- **Route protection:** `requireUser()` guards every data route (cases, documents, extractions, recommendations, audit, extract, analyze, seed reset). Errors during the session lookup also result in 401.
- **Secrets:** `LLM_API_KEY` is read only inside `/api/analyze`; nothing sensitive is exposed through `NEXT_PUBLIC_*`.
- **Upload limit:** 10 MB per file in `/api/extract`.
- **Data minimization:** only extracted text is stored; uploaded files are not kept.
- **Fictional data:** all seed content is invented.

**Not implemented yet** (see KI-14 and §17): role or organization-based authorization, rate limiting and lockout, CSRF tokens (the app relies on SameSite cookies), purging of expired sessions, password reset and email verification, server-side page guards (middleware), encryption of stored text, and audit immutability (the API accepts a client-supplied `actor`).

---

## 9. AI analysis pipeline

### 9.1 Text extraction — `POST /api/extract` (`src/lib/extract.ts`)

| File type | Library | Page handling |
|---|---|---|
| PDF | `unpdf` (PDF.js), `extractText(…, { mergePages: false })` | Real per-page text, joined with `\f`; `pageCount` is the PDF's page count |
| DOCX | `mammoth.extractRawText({ buffer })` | Single block of text; `pageCount` estimated as characters ÷ 1,800 |
| TXT, CSV, MD | UTF-8 decode | Same estimate |
| Anything else | — | Empty text plus an "Unsupported file type" warning |

A warning is also returned when a PDF or DOCX contains no extractable text (for example a scanned PDF — there is no OCR). The browser saves the result through `POST /api/documents` and logs a "Document uploaded" audit event that includes page and character counts.

### 9.2 Running an analysis (`runAI` in `src/app/(app)/cases/[id]/page.tsx`)

1. Log "AI analysis started".
2. Send the text of all the case's documents to `POST /api/analyze`, each prefixed with `--- filename ---`.
3. If the response has `mode: "llm"`, map the model's facts and recommendation (§9.3). Otherwise — or if anything fails — run the demo engine `runAnalysis()` in the browser (§9.4).
4. Replace the case's facts (`DELETE /api/extractions?caseId=` then a bulk insert), save a new recommendation (older ones are kept; the newest is displayed), update the case, and log "AI analysis completed (LLM)" or "AI analysis completed (Demo Mode)".
5. In Demo Mode the case status is also updated: `missing_docs` if the case page's checklist shows 3 or more missing documents, otherwise `flagged` if contradictions were found, otherwise `awaiting_review`. LLM mode does not change the status.

### 9.3 LLM mode — `POST /api/analyze`

- Active only when `LLM_API_KEY` is set. It calls `${LLM_BASE_URL}/chat/completions` (default `https://api.openai.com/v1`) with model `LLM_MODEL` (default `gpt-4o-mini`), `temperature: 0.2` and `response_format: {type: "json_object"}`. Input is truncated to 60,000 characters.
- The system prompt asks for JSON containing `facts[]` (field, value, confidence, sourceDoc, sourcePage, snippet, category), `contradictions[]`, `missing[]` and a `recommendation` (title, summary, reasoning, confidence, evidence[], missingInfo[], uncertainties[], nextSteps[]). It instructs the model to cite sources, never present unsupported claims as facts, and treat confidence as a heuristic.
- Non-200 responses, network errors and invalid JSON all return `mode: "demo"` with an `error`, so the UI falls back to the demo engine.
- Facts are linked to documents by exact filename match. See KI-8 for limitations.

### 9.4 Demo engine — `runAnalysis()` in `src/lib/core.ts`

Deterministic: no network access and no API key. The rules as implemented:

| Step | Rule |
|---|---|
| Page attribution | Each document's text is split on `\f`; page = index + 1. Every fact stores the real `documentId`, filename, page and a snippet |
| Client name | First match of two capitalised words (`[A-Z][a-z]+ [A-Z][a-z]+`) in the case; confidence 96 |
| Dates | Up to 3 per page in the form `Month D, YYYY`; confidence 93 |
| Amounts | Up to 3 per page in the form `$1,234`, labeled "Amount n"; confidence 92 |
| Snippet | About 30 characters either side of the match |
| Contradictions | (a) distinct amounts whose spread exceeds $2,000; (b) text mentions "refilled" or "position elimination" together with "accommodation" |
| Missing documents | A required document counts as present when the first word of its name appears in a filename or in the text |
| Recommendation | 3+ missing → "Request Missing Documents Before Proceeding" (90); else contradictions → "Investigate Contradictions Before Filing" (74); else "Proceed — Evidence Is Complete and Consistent" (86) |
| Evidence | The first 4 extracted facts (claim, document, page, snippet) |
| Uncertainties | Always includes "Demo Mode: confidence is an uncalibrated heuristic score, NOT a verified probability" and a warning that scanned or handwritten content may be missed |

### 9.5 Attribution guarantees

Every fact produced by the demo engine keeps the `documentId`, filename, page number and supporting text of the place where it was found. `tests/extraction.test.ts` covers this: facts from two documents never cross over, facts on page 2 are labeled page 2, and every evidence item has a document, a page ≥ 1 and a snippet.

### 9.6 Explainable recommendation display

For the latest recommendation of a case, the Recommendation tab shows:

1. the recommendation title and summary;
2. "Why the AI generated this" (reasoning);
3. supporting evidence;
4. the source document and page for each evidence item, with the quoted snippet;
5. a confidence value labeled "Confidence (uncalibrated)" and "heuristic only";
6. missing information;
7. uncertainties and possible exceptions;
8. numbered next steps;

plus the status, generation time, reviewer and review comment.

---

## 10. Pages & modules

### Public pages

- **`/` — Landing** (`src/app/page.tsx`): sticky navigation (Features, How It Works, Safety, About anchors; Sign in; Get Started); hero "Understand Every AI Decision. Trust Every Case." with Get Started (`/signup`) and Explore Features (`#features`); a static product-preview card (a sample recommendation for CC-2026-003); 6 feature cards; a 4-step how-it-works section with "Try the live demo"; safety and about sections; footer.
- **`/login`**: email and password with show/hide, error message, demo credentials prefilled, a "Use demo account for judges" button, Demo Mode banner.
- **`/signup`**: name, email, password (minimum 6 characters, checked in the browser), optional organization (not saved — KI-16). On success the user is signed in and sent to the dashboard.

### Workspace pages (`src/app/(app)/`, session required)

- **Shell** (`layout.tsx`): sidebar navigation (Dashboard, Cases, Upload Documents, Integrations, Evaluation, Audit Trail), New Case button, user card with sign-out, "Reset demo data", top bar with page title, search box (Enter goes to `/cases`), Demo Mode badge, notification bell (decorative), toast notifications that dismiss after 3.8 s, and a slide-in drawer below the `lg` breakpoint.
- **`/dashboard`**: total, awaiting-review, completed and missing-documents counts (by case status); cases-by-status bar chart; "Needs Your Review" (first 4 pending recommendations); Recent Cases; Recent Activity; quick actions (New Case, Upload Documents); Demo Mode and human-in-the-loop banners.
- **`/cases`**: case cards with a completeness bar; text search (title, client, case number); status and case-type filters; empty state with "Clear filters"; CSV export; New Case.
- **`/cases/new`**: title, client, case type, priority, description; title and client are required. Creates the case, logs "Case created" and opens it.
- **`/cases/[id]`**: header (case number, status, priority, completeness, dates) with actions — Run AI Analysis (enabled once the case has documents), Upload Documents, Request Documents (logs an audit event), Flag for Investigation (sets status `flagged`). Tabs:
  - *Overview* — summary, counts, latest recommendation, required-documents checklist.
  - *Documents* — drag-and-drop upload; view and download the extracted text of each document.
  - *Analysis* — extracted-facts table (field, value, source document and page, confidence, snippet), missing information, contradictions note.
  - *Recommendation* — the full explanation (§9.6) and the human review panel: comment, Approve (also sets the case to `completed`), Modify (requires replacement text, saved as the new summary with status `modified`), Reject, Request Documents.
  - *Human Review* — history of review-category audit events.
  - *Audit* — timeline of every event for the case.
- **`/upload`**: choose a destination case; drag-and-drop or browse; per-file queue (processing, processed, failed); link to the case; the 8 most recent uploads.
- **`/integrations`**: Google Drive (simulated) and CSV import/export — see §12.
- **`/evaluation`**: four manual-vs-AI-assisted comparisons labeled "Illustrative demo measurements — replace with real testing results", a three-step method for replacing them with real results, and a workspace-totals card (hardcoded, KI-4).
- **`/audit`**: global timeline with search, category filter, links to cases and CSV export (`caseclarity-audit-trail.csv`).

### Shared building blocks

- `src/components/ui.tsx`: `Logo`, `Badge`, `StatusBadge`, `DemoBanner`, `SafetyBanner`, `EmptyState`, `Card`, `Btn`, `Field`, `inputCls`, `PriorityDot` (`ConfidenceBar` and `DocIcon` are exported but unused).
- `src/lib/store.tsx`: `useStore()` exposes `user`, `ready`, the data arrays and the actions `login`, `signup`, `logout`, `addCase`, `updateCase`, `addDoc`, `addExtractions`, `replaceCaseExtractions`, `addRec`, `updateRec`, `importCases`, `resetDemo`, `log` and `notify`. `log()` adds a temporary local entry immediately and persists it through `POST /api/audit`.
- `src/lib/core.ts`: domain types, `CASE_TYPES`, `REQUIRED_DOCS`, seed data, `runAnalysis()`, `EVALUATION`, `DRIVE_FILES`, `uid`, `fmtDate`, `fmtTime`, `fmtSize`.

---

## 11. Demo data

The data is seeded by `POST /api/seed` from `src/lib/core.ts` the first time a signed-in user finds the `cases` table empty. "Reset demo data" in the sidebar restores it.

| Case | Client | Type | Seeded status | Docs | Scenario | Seeded recommendation (confidence) |
|---|---|---|---|---|---|---|
| CC-2026-001 | Maria Gonzalez | Housing / Eviction | awaiting_review | 5 | **Complete documents** — eviction notice after a medical emergency | File emergency stay + payment plan (88) |
| CC-2026-002 | James Carter | Benefits Appeal | missing_docs | 1 | **Missing documents** — SNAP denial; only the letter is on file | Request documents before filing the appeal (92) |
| CC-2026-003 | Aisha Thompson | Employment | flagged | 4 | **Contradictory information** — $62,000 vs $69,600 salary; "eliminated" role refilled | Investigate contradictions before filing (74) |
| CC-2026-004 | David Okafor | Family Law | in_progress | 2 | Custody modification; financial disclosure pending | Draft petition after financial disclosure (71) |
| CC-2026-005 | Rosa Delgado | Consumer Debt | completed | 1 | Debt validation; the creditor did not respond | Case closed — creditor failed to validate (95, approved) |
| CC-2026-006 | Yusuf Hassan | Immigration | awaiting_review | 2 | Asylum support letter; sponsorship letter outstanding | Obtain sponsorship letter (79) |

Totals: 6 cases, 15 documents, 20 curated facts (each with document, page and snippet), 6 recommendations and 14 audit events. Seed documents are short fictional texts; their page counts are illustrative.

> **Important for demos:** the seeded recommendations are hand-written examples. Clicking **Run AI Analysis** on a seeded case replaces its curated facts with demo-engine output and adds a new recommendation that may differ — see KI-6. Use "Reset demo data" to restore the originals.

---

## 12. Integrations

### CSV import (functional) — Integrations page → Import CSV

- **Parsing:** PapaParse (RFC 4180) through `parseCasesCSV()` — quoted fields, embedded commas and newlines, CRLF line endings. Headers are trimmed and lower-cased; parser errors are listed in the report.
- **Column aliases:** client from `client_name`, `client` or `name`; title from `title`, `case_title` or `case`; type from `case_type`, `type` or `category`; date from `date`, `created` or `created_at`.
- **Messy-data handling:** a warning for missing client or title columns; per-row warnings with defaults ("Imported Client n", "Imported case for …") for empty values; case type defaults to "Other"; date formats are detected (YYYY-MM-DD, MM/DD/YYYY, other) with a warning when they are mixed; duplicates (same client + title, case-insensitive, within the file or against existing cases) are skipped on the server.
- **Report:** rows read, cases added, duplicates skipped, warnings. An audit event "CSV import" is written.
- A sample file containing a duplicate row and mixed date formats can be downloaded from the page.
- Limitations: KI-12.

### CSV export (functional)

- Cases → `caseclarity-cases-export.csv` (from the Cases page and the Integrations page). Audit trail → `caseclarity-audit-trail.csv`. Every export is audit-logged. Limitation: KI-3.

### Google Drive (simulated)

- Lists 5 fictional files from `DRIVE_FILES`. "Import" creates a document with placeholder text and source "Google Drive (simulated)" on the first case in the list, and writes an audit event. The card is labeled "Simulated" and shows "Last sync: never (simulated)". No OAuth or Drive API calls are made.

---

## 13. Testing & validation

**Automated:** `npx vitest run` — 3 files, 14 tests, all passing.

| File | What is tested |
|---|---|
| `tests/extraction.test.ts` (6) | Real PDF extraction (generated PDF), real DOCX extraction (generated with jszip), TXT extraction, facts attributed to their own document, page attribution through `\f`, evidence items carry document, page and snippet |
| `tests/auth.test.ts` (4) | Hash is not plaintext and uses the bcrypt format, the correct password verifies, a wrong password fails, the same password produces different salted hashes |
| `tests/csv.test.ts` (4) | Quoted fields containing commas, mixed date formats, missing columns produce defaults and warnings, dedupe by client + title |

**Not covered by automated tests:** API routes and session handling (401s, cookies), the LLM path, and UI flows. These were checked manually during development with `curl` against a production build: unauthenticated `GET /api/cases` → 401; demo login → session cookie; wrong password → 401; real PDF upload → extracted text; `/api/analyze` without a key → `mode: "demo"`; `GET /api/auth` with the cookie → user.

**Validation sequence** (all steps pass at last review — see AGENTS.md §8):

```bash
npx vitest run
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run build
```

`tests/` and `vitest.config.ts` are excluded in `tsconfig.json`, so `next build` does not type-check the tests; Vitest compiles them itself.

---

## 14. Configuration & environment variables

| Variable | Required | Default | Used by |
|---|---|---|---|
| `DATABASE_URL` | yes | — | `src/db/index.ts` (throws when first imported if missing) |
| `LLM_API_KEY` | no | — | `/api/analyze`; enables LLM mode |
| `LLM_BASE_URL` | no | `https://api.openai.com/v1` | `/api/analyze` |
| `LLM_MODEL` | no | `gpt-4o-mini` | `/api/analyze` |

- `.env.example` documents the variables above.
- `drizzle.config.json` contains its own **hardcoded** connection string (`postgresql://postgres:postgres@127.0.0.1:5432/app_db`); `drizzle-kit` does not read `DATABASE_URL`. Update both if your database is different.
- `next.config.ts` is the default (empty) configuration. `tsconfig.json` uses strict mode and the `@/*` → `src/*` alias.

---

## 15. What is simulated

1. **Google Drive import** — fictional file list and placeholder content; labeled "Simulated".
2. **AI analysis in the current environment** — the Demo Mode engine (deterministic heuristics) runs because no LLM key is configured. The LLM code path is real but untested with a live key.
3. **Confidence scores** — heuristics labeled as uncalibrated; not validated probabilities (in both modes).
4. **Evaluation metrics** — illustrative placeholders, clearly labeled; not the results of a study.
5. **Seed content** — fictional cases, documents, facts, recommendations and audit history. Seed facts and recommendations are curated, not produced by the engine.
6. **Notification bell** — the bell and its "3" badge are decorative.

---

## 16. Known issues & limitations

> **Status (branch `fix/known-issues`, 2026-11-16): KI-1 to KI-16 are fixed**, except the parts listed under *Still open* below. The original descriptions are kept for history.
>
> Still open: OCR for scanned PDFs and legacy `.doc` (KI-10); storing original files (KI-10); real DOCX page boundaries — DOCX/TXT/CSV pages are now *estimated* at ~1,800 characters (KI-9); organization scoping (roles exist, but all users of a deployment share one workspace) and password reset / email verification (KI-14); a live-key test of LLM mode — it was verified end-to-end against a mock OpenAI-compatible server (KI-8). The login rate limiter is in-memory per instance. Attempts are reserved atomically and refunded on success, so only failed logins (and successful signups) count. Limits: 30 failures per account per 15 min (always), plus 10 per account + IP and 50 per IP when `TRUST_PROXY=true`. A third party with 30 failures can still lock an account for up to 15 minutes; a CAPTCHA would remove that.

These were verified during the documentation review by reading the code, inspecting the database and running `runAnalysis()` on the seed data.

**KI-1 — Case completeness is not persisted.** `CaseItem.completeness` exists in TypeScript, but the `cases` table has no `completeness` column (confirmed in the database). Drizzle silently ignores keys that are not columns, so seed values and analysis updates are dropped. Cases loaded from the API therefore show an empty percentage and an empty bar on case cards and in the case header, and the completeness column of the CSV export is empty. *Fix:* add `completeness: integer("completeness").default(0)` to `cases`, run `npx drizzle-kit push`, then reset the demo data.

**KI-2 — Lists come back oldest-first.** The cases, documents, recommendations and audit `GET` routes order ascending by time, while the dashboard's "Recent Cases" (`cases.slice(0, 5)`) and "Recent Activity" (`audit.slice(0, 6)`) assume newest-first. After a reload they show the oldest records; newly created items appear first only until the next reload. Audit timelines are also oldest-first after a reload. *Fix:* order with `desc(...)` in the routes, or sort in the client.

**KI-3 — Case CSV export is not fully quoted.** Only the title is quoted. The "Created" value (`fmtDate`, e.g. `Apr 28, 2026`) contains a comma and splits into two columns, and client names containing commas would break the same way. *Fix:* generate exports with `Papa.unparse()`.

**KI-4 — Hardcoded numbers.** The sidebar "Cases" badge always shows `6`. The Evaluation page's "Current Workspace Totals" always show 6 / 15 / 20 / 6, although they are labeled as live counts. The bell badge always shows `3`.

**KI-5 — The required-document checklist is keyword-based.** A requirement counts as present when the first word of its name appears in a filename (case page) or in a filename or the text (demo engine). For example, `Pay_Stubs_Mar2026.pdf` does not satisfy "Proof of Income", so the "complete" demo case shows Government ID and Proof of Income as missing.

**KI-6 — Re-running analysis on a seeded case changes its recommendation.** Output of `runAnalysis()` on the seed data:

| Case | Seeded recommendation | Demo engine output on re-run |
|---|---|---|
| CC-2026-001 (complete) | Emergency stay + payment plan (88) | Investigate Contradictions (74) — rent, income and bill amounts differ by more than $2,000; the detected client name is "Sunset Properties" |
| CC-2026-002 (missing docs) | Request documents (92) | Request Missing Documents (90) |
| CC-2026-003 (contradictions) | Investigate contradictions (74) | Request Missing Documents (90) — 2 contradictions are found, but 3 missing checklist items take precedence |
| CC-2026-004 | Draft petition after disclosure (71) | Request Missing Documents (90) |
| CC-2026-005 | Case closed (95, approved) | Request Missing Documents (90) |
| CC-2026-006 | Obtain sponsorship letter (79) | Proceed — Evidence Is Complete (86), while listing 2 missing documents |

**KI-7 — The demo engine's heuristics are simple.** Name detection takes the first pair of capitalised words (e.g. "Sunset Properties", "Apex Collections"); only `Month D, YYYY` dates are found; amounts are generic ("Amount n") rather than classified as income or rent; at most 3 dates and 3 amounts are taken per page; and the "Proceed" branch is chosen with up to 2 missing documents, while its summary says all documents are present.

**KI-8 — LLM mode is unverified and loosely validated.** It has not been run with a live key. The response is parsed with `JSON.parse` but not validated against a schema. A fact whose `sourceDoc` does not exactly match an uploaded filename is linked to the case's first document. The prompt does not mark page boundaries, so the model's page citations may be unreliable. LLM mode does not update the case status.

**KI-9 — Page numbers are only real for PDFs.** DOCX, TXT and CSV page counts are estimates (characters ÷ 1,800), and their facts are always attributed to page 1.

**KI-10 — Extraction gaps.** There is no OCR (scanned PDFs return a "no extractable text" warning). Legacy `.doc` files are not supported. Files of other types dropped onto a dropzone are saved with placeholder text. Original files are not stored, so documents cannot be re-processed or downloaded in their original form.

**KI-11 — "Demo Mode" labels are static.** The Demo Mode banner, the "Run AI Analysis (Demo Mode)" button, the "AI Recommendation · Demo Mode" header and the top-bar badge are always shown, even with an LLM key configured. The upload dropzones still say that binary parsing is simulated ("Demo Mode parsing"), although extraction is now real.

**KI-12 — CSV import ignores some values.** Date values are detected but not stored (imported cases get the import time), even though the report says "normalized to ISO". `priority` and `status` columns are not read; imported cases are `medium` and `awaiting_review`.

**KI-13 — The Drive simulation always targets the first case.** Imports go to `cases[0]` (the oldest case under the current ordering) with no case picker, and the "Imported" button state resets on reload.

**KI-14 — Security gaps.** No role or ownership authorization; no rate limiting; no CSRF tokens (SameSite=Lax only); expired sessions are never purged; `POST /api/audit` accepts a client-supplied `actor`; `POST /api/seed` is unauthenticated while the database is empty; the minimum password length is checked only in the browser; no password reset or email verification; workspace pages are guarded only in the browser (the data APIs are protected on the server).

**KI-15 — Data integrity.** Foreign keys lack `ON DELETE CASCADE`, so `DELETE /api/cases/[id]` fails for cases with related rows (no UI uses it). "Reset demo data" logs its audit event without waiting for the reset to finish, so the reset can delete that entry.

**KI-16 — Minor items.** The sign-up "Organization" field is not saved (the organization is always "Northside Legal Aid"). New users see the role "Case Worker" right after sign-up but `case_worker` after a reload. The top-bar search only navigates to `/cases` and does not pass the query. `ConfidenceBar`, `DocIcon` and `DEMO_USER` are unused. There is no `npm test` script.

---

## 17. Remaining work

> Updated 2026-11-20 against the code on `main`. Ticked items are verified in the code; the plain-language summary is in [PROJECT_STATUS.md](./PROJECT_STATUS.md).

**P0 — before the final demo / submission**

- [x] Add a `.gitignore`.
- [x] Persist completeness (KI-1).
- [x] Return lists newest-first (KI-2).
- [x] RFC 4180 CSV export with `Papa.unparse()` (KI-3).
- [x] Replace hardcoded counts with live data (KI-4).
- [x] Make the Demo Mode labels reflect the actual mode, and fix the stale upload text (KI-11).
- [x] Merge `fix/known-issues` into `main`.
- [x] Full UI walkthrough in a browser (desktop and 390 px mobile) — done 2026-11-20; it found and fixed mobile overflow on the dashboard and case documents, a timezone shift on DB-defaulted timestamps, and a 401 console error on signed-out pages.
- [ ] Test LLM mode with a live API key (KI-8).
- [ ] Judges' deployment: `DEMO_ACCOUNT=true`, `TRUST_PROXY=true`, `TRUSTED_IP_HEADER`; run `npm run db:push` and *Reset demo data* on it.

**P1 — AI quality and reliability**

- [x] Send explicit document/page markers in the LLM prompt; verify every citation server-side and mark unmatched facts "Unverified" instead of falling back to the first document (KI-8).
- [x] Synonym-based required-document checklist shared by the UI and the engine (KI-5).
- [x] Improve the demo engine: labelled amounts and dates, like-for-like contradiction checks, an "obtain remaining documents" branch (KI-6, KI-7).
- [ ] Classify documents by content rather than filename/text keywords.
- [ ] Store contradictions as first-class records and list them on the Analysis tab.
- [ ] Per-document summaries.
- [ ] OCR for scanned PDFs; legacy `.doc`; real page boundaries for DOCX; keep original files (KI-9, KI-10).

**P2 — Security and compliance**

- [x] Roles (`case_worker`, `senior_case_worker`, `admin`) with manager-only actions.
- [x] Login/signup rate limiting; origin-checked API (`src/proxy.ts`); expired-session cleanup; server-side password rules.
- [x] Audit actor and reviewer taken from the session; the audit API has no update or delete paths.
- [x] `/api/seed` requires a session and demo mode; reset is manager-only.
- [ ] Organization scoping (all users of a deployment share one workspace).
- [ ] Password reset and email verification; admin screen for roles; CAPTCHA after repeated failures; shared (non-in-memory) rate limiting.
- [ ] Encrypted storage of original documents with retention rules.

**P3 — Integrations**

- [x] Import dates, priority and status from CSV (KI-12).
- [ ] Column-mapping step for CSV imports.
- [ ] Real Google Drive integration (OAuth 2.0 + Drive API). Keep the "Simulated" label until then.

**P4 — Testing and tooling**

- [x] `npm test` script; test-only packages in `devDependencies`.
- [x] CI pipeline: `.github/workflows/ci.yml` runs tests, typecheck, lint and build on every push and pull request.
- [ ] API integration tests (sessions, 401s, CRUD) and end-to-end UI tests in the repo.

**P5 — Evaluation**

- [ ] Run the timed user study and extraction benchmark described on the Evaluation page, then replace `EVALUATION` in `src/lib/core.ts` with measured results and link the method.

---

## 18. Development history

1. **Initial build** — the complete UI (landing, auth, dashboard, cases, case workspace, upload, integrations, evaluation, audit), the deterministic demo engine and fictional seed data. Data and accounts were kept in browser localStorage.
2. **Bug-fix pass** — correct CSV import counts, toast notifications instead of `alert()`, no duplicate facts when an analysis is re-run, and "Save Modification" requires text.
3. **Backend hardening** — real PDF/DOCX extraction (`/api/extract`), an LLM endpoint with a server-side key (`/api/analyze`), per-document and per-page attribution in `runAnalysis()`, bcrypt with server-side sessions, PapaParse CSV parsing, a PostgreSQL-backed store with protected API routes, and 14 automated tests.
4. **Documentation** — `CONTEXT.md`, `AGENTS.md` and `PROBLEM_STATEMENT.md` added. No application code was changed.
5. **Repository setup** — `.gitignore` added and the project committed to a git repository on the `main` branch. No application code was changed.
6. **Known-issues fix pass** (`fix/known-issues`) — completeness persisted; newest-first lists; RFC 4180 exports; live counts; mode-aware labels and a per-recommendation `engine`; synonym-based document checklist shared by the UI and engine; reworked demo engine (case client name, labelled amounts, like-for-like contradictions, an "obtain remaining documents" branch); LLM prompt with document/page markers and server-side citation verification (`verified` flag); estimated pages for DOCX/TXT; CSV import of date/priority/status; Drive case picker; checked writes with error toasts and session-expiry handling; server-side validation; roles (`case_worker`, `senior_case_worker`, `admin`); login rate limiting; origin-checked API (`src/proxy.ts`); session-derived audit actor and reviewer; locked reviews; cascade deletes; `DEMO_ACCOUNT` flag; `drizzle.config.ts`; `npm test`. 41 unit tests.
7. **Release pass** (2026-11-20, merged to `main`) — Next.js 16.4.2 → 16.4.6 (security advisories); browser walkthrough of every page and flow; mobile overflow fixes (`*:min-w-0` on dashboard and case-detail grids); the DB pool pins the session timezone to UTC so `defaultNow()` timestamps are not shifted on non-UTC databases; `GET /api/auth` returns `200 {"user":null}` when signed out; GitHub Actions CI. 46 unit tests.
