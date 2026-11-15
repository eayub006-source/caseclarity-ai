<div align="center">

# CaseClarity AI

**Understand Every AI Decision. Trust Every Case.**

Evidence-backed, human-reviewed AI assistance for legal-aid case management.

A Build for Campus 2026 project by **Team HACKSMITHS**

![Next.js](https://img.shields.io/badge/Next.js-16.4-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-06B6D4?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?logo=drizzle&logoColor=black)
![Status](https://img.shields.io/badge/status-hackathon_prototype-orange)

</div>

CaseClarity AI helps case workers at small legal-aid nonprofits turn long, inconsistent case documents into source-cited facts and **explainable recommendations** — while a human stays in charge of every decision. Each recommendation shows *why* it was made, the evidence behind it with document and page references, a confidence indicator clearly labeled as an uncalibrated heuristic, what information is missing, what is uncertain, and what to do next. Every upload, analysis and review action is written to an audit trail.

> **The AI assists. Humans decide.** CaseClarity AI never makes final legal decisions. All demo data is fictional, and nothing in this project is legal advice.

**Demo login:** `demo@caseclarity.ai` / `demo1234` — the account is created automatically the first time you sign in.

---

## Contents

- [The problem](#the-problem)
- [Our solution](#our-solution)
- [How it works](#how-it-works)
- [Key features](#key-features)
- [What is real and what is simulated](#what-is-real-and-what-is-simulated)
- [Quick start](#quick-start)
- [Demo guide for judges](#demo-guide-for-judges)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Installation and local setup](#installation-and-local-setup)
- [Environment variables](#environment-variables)
- [Running the project](#running-the-project)
- [Tests and quality checks](#tests-and-quality-checks)
- [API overview](#api-overview)
- [Responsible AI](#responsible-ai)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [Team](#team)
- [License and disclaimer](#license-and-disclaimer)

---

## The problem

Small legal-aid nonprofits help people facing eviction, benefit denials, employment disputes and other urgent legal problems — usually with few staff and hard deadlines. Their case workers deal with:

- **Long, inconsistent documents.** Leases, notices, pay stubs, letters and emails arrive in different formats, and the important facts are scattered across them.
- **Missing information.** A case stalls when a required document is absent, and deadlines make every gap costly.
- **Contradictions.** Figures and dates that disagree between documents are easy to miss in manual review.
- **Untrustworthy AI.** A recommendation without reasons or evidence cannot be verified, and an unexplained "confidence score" invites over-trust.
- **Accountability.** Teams must be able to show who decided what, when, and based on which evidence.
- **Messy existing systems.** Case data often lives in spreadsheets, CSV exports and shared drives rather than clean APIs.

## Our solution

CaseClarity AI combines case management with explainable AI assistance, a human review workflow and a complete audit trail.

| Principle | How CaseClarity AI applies it |
|---|---|
| Explainability by default | Every recommendation shows its reasoning, evidence, missing information, uncertainties and next steps |
| Evidence attribution | Every extracted fact keeps its source document, page number and a quoted snippet |
| Human in the loop | Recommendations start as *pending*; only a case worker can approve, modify or reject them |
| Honest uncertainty | Confidence is labeled as an uncalibrated heuristic; gaps and caveats are shown, not hidden |
| Full auditability | Uploads, analyses, recommendations and review actions are stored with the actor and a timestamp |
| Works with messy data | A tolerant CSV import that reports problems instead of silently dropping them |
| Graceful degradation | Without an LLM API key, a transparent, deterministic Demo Mode keeps the whole workflow usable |

### Our approach

- **One full-stack TypeScript codebase.** Next.js (App Router) renders the interface, and its Route Handlers act as the backend: the REST API, document extraction and the LLM proxy all run in Node.js.
- **PostgreSQL with Drizzle ORM** stores users, sessions, cases, documents, extracted facts, recommendations and the audit log.
- **Real, page-aware text extraction on the server.** PDF.js (through `unpdf`) reads PDFs page by page so that facts can cite their page; `mammoth` reads Word (`.docx`) files.
- **Two analysis modes.** When `LLM_API_KEY` is set, the server calls an OpenAI-compatible LLM that must return structured, cited JSON. Otherwise a deterministic, rule-based demo engine runs instead — and the UI and audit trail say so.
- **Security basics.** bcrypt password hashes, server-side sessions in an httpOnly cookie, and authentication on every data endpoint.
- **Honesty over hype.** Simulated integrations and illustrative metrics are labeled as such in the product.

## How it works

```mermaid
flowchart LR
  U["Upload documents"] --> X["Extract text<br/>page by page"]
  X --> A["Analyze<br/>LLM or Demo Mode"]
  A --> R["Explainable<br/>recommendation"]
  R --> H{"Human review"}
  H -->|"Approve / Modify / Reject"| L["Decision saved<br/>to audit trail"]
  H -->|"Request documents / Flag"| U
```

1. **Upload** — add PDF, DOCX, TXT, CSV or MD files (up to 10 MB each) to a case by drag and drop or with the file picker.
2. **Extract** — the server extracts the text (PDFs page by page) and stores it with the document.
3. **Analyze** — *Run AI Analysis* sends the case's text to the backend. The LLM (if configured) or the demo engine extracts facts with document, page and snippet, checks the case type's required-document checklist, and looks for contradictions.
4. **Recommend** — a new *pending* recommendation is saved with its reasoning, evidence, confidence, missing information, uncertainties and next steps.
5. **Review** — a case worker approves, modifies or rejects it, adds a comment, requests more documents or flags the case for investigation.
6. **Audit** — every step is recorded with the actor, a category and a timestamp.

## Key features

### Case workspace
- **Dashboard** — total cases, cases awaiting review, completed cases and cases with missing documents; a cases-by-status chart; a *Needs Your Review* queue; recent cases and recent activity; quick actions to create a case or upload documents.
- **Cases** — create cases, browse them as cards, search by title, client or case number, filter by status and case type, and export to CSV.
- **Case detail** with six tabs:
  - *Overview* — summary, counts, latest recommendation and the required-documents checklist
  - *Documents* — upload files, view and download extracted text
  - *Analysis* — table of extracted facts with source document, page, confidence and snippet
  - *Recommendation* — the full explanation plus the review panel
  - *Human Review* — history of review decisions
  - *Audit* — the case's timeline

### Documents and analysis
- **Real text extraction** for PDF (per page), DOCX, TXT, CSV and MD, with a warning when a file contains no extractable text (for example, a scanned PDF).
- **Facts with provenance** — the demo engine extracts names, dates and dollar amounts, each tied to the document, page and text it came from.
- **Missing-document detection** against a required-document checklist for each case type.
- **Contradiction checks** (demo engine heuristics) — amounts that differ by more than $2,000 across documents, and a keyword rule for a "position eliminated but later refilled" conflict.
- **LLM analysis endpoint** — requests structured JSON with cited facts and a recommendation, using an API key that never leaves the server.

### Explainable recommendations
Every recommendation displays:
1. the recommendation itself;
2. why the AI generated it;
3. the supporting evidence;
4. the source document and page for each piece of evidence, with the quoted text;
5. a confidence indicator labeled as uncalibrated ("heuristic only");
6. missing information;
7. uncertainties and possible exceptions;
8. numbered next steps.

### Human review and audit trail
- **Review actions** — approve (which marks the case completed), modify (replacement text required), reject, comment, request additional documents, or flag a case for investigation.
- **Audit trail** — every action is stored in PostgreSQL and viewable per case and across all cases, with search, category filters and CSV export.

### Integrations
- **CSV case import** — standards-compliant parsing (RFC 4180, via PapaParse) with flexible column names, warnings for missing columns and incomplete rows, mixed date-format detection, duplicate detection and an import report.
- **CSV export** of cases and of the audit trail.
- **Google Drive import — simulated.** Clearly labeled as simulated in the UI; there is no real Drive connection.

### Platform
- **Accounts** — email and password sign-up and sign-in, plus a one-click demo account for judges.
- **Interface** — responsive navy-and-blue design for desktop, tablet and mobile.
- **Evaluation page** — compares manual and AI-assisted review using **illustrative** (not measured) numbers, with a documented method for replacing them with real results.

## What is real and what is simulated

| Capability | Status |
|---|---|
| PostgreSQL persistence, authenticated API, bcrypt and server-side sessions | ✅ Real |
| PDF, DOCX, TXT, CSV and MD text extraction | ✅ Real |
| Explainable recommendations and the human review workflow | ✅ Real |
| Audit trail stored in the database | ✅ Real |
| CSV import and export | ✅ Real |
| AI analysis in Demo Mode | 🟡 Real, but rule-based heuristics — no LLM involved |
| AI analysis with an LLM | 🟡 Implemented; not yet verified with a live API key |
| Confidence scores | 🟡 Uncalibrated heuristics — not probabilities |
| Google Drive import | 🧪 Simulated (labeled in the UI) |
| Evaluation metrics | 🧪 Illustrative placeholders (labeled in the UI) |
| Demo cases, documents and history | 🧪 Fictional |

With the default configuration (no `LLM_API_KEY`), analysis runs in **Demo Mode**.

## Quick start

You need **Node.js 22**, **npm** and a **PostgreSQL 15** database (see [Installation and local setup](#installation-and-local-setup) for details).

```bash
git clone https://github.com/eayub006-source/caseclarity-ai.git
cd caseclarity-ai
npm install
cp .env.example .env      # defaults point to postgres:postgres@127.0.0.1:5432/app_db
npx drizzle-kit push      # creates the database tables
npm run dev               # http://localhost:3000
```

Open <http://localhost:3000/login> and sign in with `demo@caseclarity.ai` / `demo1234`. On the first sign-in, the demo account and the fictional dataset (6 cases, 15 documents, 20 facts, 6 recommendations, 14 audit events) are created automatically.

## Demo guide for judges

1. **Sign in** — the login form is pre-filled with the demo account, or click *Use demo account for judges*.
2. **Dashboard** — review the case counts, the status chart and the review queue.
3. **Complete documents** — open **CC-2026-001 (Maria Gonzalez, eviction)**. The *Recommendation* tab shows an evidence-backed recommendation citing four documents.
4. **Missing documents** — open **CC-2026-002 (James Carter, SNAP benefits appeal)**. The recommendation advises *not* to file yet and lists the missing documents and the appeal deadline.
5. **Contradictory information** — open **CC-2026-003 (Aisha Thompson, employment)**. The recommendation highlights a salary mismatch ($62,000 vs $69,600) and a termination-timeline conflict, with moderate confidence.
6. **Human review** — approve, modify or reject a recommendation with a comment, then open **Audit Trail** to see the decision recorded.
7. **Real extraction** — upload a PDF or DOCX on any case's *Documents* tab, then click **Run AI Analysis**.
8. **Integrations** — download the sample CSV on the *Integrations* page and import it to see duplicate and date-format handling.

> **Tip:** the six demo cases ship with hand-written example recommendations. Running the analysis on a seeded case replaces its example facts with the demo engine's output, which can differ. Use **Reset demo data** in the sidebar to restore the originals.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.4 (App Router and Route Handlers) |
| UI | React 19.2, Tailwind CSS 4.1, lucide-react icons |
| Language | TypeScript 5.9 (strict mode) |
| Database | PostgreSQL 15, Drizzle ORM 0.45, `pg` driver, `drizzle-kit` for schema push |
| Document parsing | `unpdf` (PDF.js) for PDF, `mammoth` for DOCX |
| CSV | PapaParse (RFC 4180) |
| Authentication | `bcryptjs` password hashing, server-side sessions in an httpOnly cookie |
| AI | Optional OpenAI-compatible Chat Completions API (default model `gpt-4o-mini`), or the built-in demo engine |
| Testing and linting | Vitest, ESLint with `eslint-config-next` |
| Runtime | Node.js 22 |

## Architecture

```mermaid
flowchart LR
  B["Browser<br/>Next.js client pages"] -->|"fetch + session cookie"| API["Route Handlers<br/>src/app/api"]
  API --> DB[("PostgreSQL<br/>Drizzle ORM")]
  API -->|"only if LLM_API_KEY is set"| LLM["OpenAI-compatible<br/>LLM API"]
  B -.->|"Demo Mode fallback"| ENG["Demo engine<br/>src/lib/core.ts"]
```

- **Client:** all pages are React client components. A single client store (`src/lib/store.tsx`) handles every data read and write through the API.
- **Backend:** the Route Handlers in `src/app/api/` are the backend, and every data route requires a valid session.
- **Analysis:** `/api/extract` parses uploads on the server. `/api/analyze` calls the LLM when a key is configured; otherwise the browser runs the demo engine (`runAnalysis()` in `src/lib/core.ts`).
- **Data:** everything lives in PostgreSQL; the schema (7 tables) is defined in `src/db/schema.ts`.

## Project structure

```
caseclarity-ai/
├── src/
│   ├── app/
│   │   ├── page.tsx              # landing page
│   │   ├── login/                # sign-in page
│   │   ├── signup/               # sign-up page
│   │   ├── (app)/                # signed-in workspace
│   │   │   ├── layout.tsx        # sidebar, top bar, sign-in gate, notifications
│   │   │   ├── dashboard/        # stats, status chart, review queue
│   │   │   ├── cases/            # case list, new case, case detail ([id])
│   │   │   ├── upload/           # upload documents to a case
│   │   │   ├── integrations/     # CSV import/export, Google Drive (simulated)
│   │   │   ├── evaluation/       # illustrative performance metrics
│   │   │   └── audit/            # global audit trail
│   │   └── api/                  # backend Route Handlers: auth, cases, documents, extract,
│   │                             #   extractions, recommendations, analyze, audit, seed, health
│   ├── components/ui.tsx         # shared UI components
│   ├── db/                       # Drizzle client (index.ts) and schema (schema.ts)
│   └── lib/
│       ├── core.ts               # domain types, demo data, demo analysis engine
│       ├── store.tsx             # client data store that calls the API
│       ├── extract.ts            # PDF, DOCX and text extraction (server)
│       ├── csv.ts                # CSV parsing, mapping and duplicate detection
│       ├── auth-server.ts        # sessions and route protection (server)
│       └── password.ts           # bcrypt helpers (server)
├── tests/                        # Vitest unit tests
├── .env.example                  # environment variable template
├── drizzle.config.json           # drizzle-kit configuration
├── AGENTS.md                     # developer guide
├── CONTEXT.md                    # verified project context
├── PROBLEM_STATEMENT.md          # problem and solution
└── package.json
```

## Installation and local setup

### 1. Prerequisites
- **Node.js 22** (tested with 22.23.4) and npm
- **PostgreSQL 15** (tested with 15.19)

### 2. Install dependencies
```bash
npm install
```

### 3. Create a database
The default configuration expects a database named `app_db` on `127.0.0.1:5432`, with the user and password `postgres`:

```bash
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE app_db;"
```

Or run PostgreSQL with Docker:

```bash
docker run --name caseclarity-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app_db -p 5432:5432 -d postgres:15
```

### 4. Configure environment variables
```bash
cp .env.example .env
```
Then adjust the values if needed — see [Environment variables](#environment-variables).

### 5. Create the tables
```bash
npx drizzle-kit push
```

> **Note:** `drizzle-kit` reads its connection string from `drizzle.config.json`, which is set to the default local database. It does not read `.env`. If you use a different database, update the `url` in `drizzle.config.json` as well as `DATABASE_URL` in `.env`.

### 6. Start the app
```bash
npm run dev
```
Open <http://localhost:3000> and sign in with the demo account. The demo data is seeded automatically on the first sign-in.

## Environment variables

All variables are listed in [`.env.example`](./.env.example):

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string used by the app |
| `LLM_API_KEY` | No | *(empty)* | Enables LLM analysis; leave it empty to use Demo Mode |
| `LLM_BASE_URL` | No | `https://api.openai.com/v1` | Base URL of an OpenAI-compatible API |
| `LLM_MODEL` | No | `gpt-4o-mini` | Model name sent to the API |

- The LLM key is read only on the server and is never sent to the browser.
- `.env` is listed in `.gitignore` — never commit it.
- Some UI labels say "Demo Mode" even when a key is configured (see [Known limitations](#known-limitations)).

## Running the project

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload at <http://localhost:3000> |
| `npm run build` | Production build |
| `npm run start` | Starts the production server (run `npm run build` first) |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript compiler without emitting files |

- **Health check:** `curl http://localhost:3000/api/health` returns `{"ok":true}` when the app can reach the database.
- **Demo data:** seeded automatically on the first sign-in when the database has no cases. *Reset demo data* in the sidebar restores it; this deletes all case data but keeps user accounts.

## Tests and quality checks

```bash
npx vitest run
```

The suite contains **14 unit tests** in `tests/` and does not need a database:

| File | What it covers |
|---|---|
| `tests/extraction.test.ts` | Real PDF, DOCX and TXT extraction; facts attributed to the correct document and page; every evidence item has a document, page and snippet |
| `tests/auth.test.ts` | bcrypt hashing: no plaintext storage, correct and incorrect passwords, salted hashes |
| `tests/csv.test.ts` | Quoted fields containing commas, mixed date formats, missing columns, duplicate detection |

Full validation sequence:

```bash
npx vitest run
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run lint
npm run build
```

There is no `npm test` script yet — use `npx vitest run`. API routes and UI flows are not yet covered by automated tests.

## API overview

All routes return JSON. Apart from the health check, the auth endpoint and first-run seeding, every route requires a valid session cookie and returns `401` otherwise.

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/health` | GET | Database health check |
| `/api/auth` | GET, POST | Current session; login, sign-up and logout |
| `/api/seed` | POST | Seeds demo data into an empty database; `?reset=1` resets it (signed-in users only) |
| `/api/cases` | GET, POST | Lists and creates cases; bulk CSV import with duplicate detection |
| `/api/cases/[id]` | PATCH, DELETE | Updates or deletes a case |
| `/api/documents` | GET, POST | Lists and saves documents |
| `/api/extract` | POST | Extracts text from an uploaded file (multipart, 10 MB maximum) |
| `/api/extractions` | GET, POST, DELETE | Extracted facts (replaced when a case is re-analyzed) |
| `/api/recommendations` | GET, POST | Lists and creates recommendations |
| `/api/recommendations/[id]` | PATCH | Records a review decision |
| `/api/analyze` | POST | Runs LLM analysis, or returns a Demo Mode signal when no key is set |
| `/api/audit` | GET, POST | Reads and appends audit entries |

The full reference, including request and response formats, is in [CONTEXT.md](./CONTEXT.md#7-api-reference).

## Responsible AI

- **No final legal decisions** — recommendations are advisory and wait for a human decision.
- **Facts are separated from interpretation** — facts are shown with their source document, page and quoted text; recommendations are labeled as AI-generated and come with reasoning and uncertainties.
- **Evidence and uncertainty are always visible** — missing information and uncertainties are part of every recommendation, and the interface warns when a recommendation has no cited evidence.
- **Honest confidence** — confidence values are labeled as uncalibrated heuristics, not probabilities.
- **No fake integrations** — simulated features and illustrative metrics are labeled in the interface.
- **Privacy** — only fictional data is used; secrets stay on the server; passwords are hashed; only extracted text is stored, and original files are not kept.

## Known limitations

This is a hackathon prototype. The most important limitations are listed below; the full, verified list is in [CONTEXT.md](./CONTEXT.md#16-known-issues--limitations).

- **Completeness not saved** — case completeness percentages are not stored in the database, so they appear blank.
- **Oldest-first lists** — lists come back oldest-first, so the dashboard's "Recent" widgets show the oldest items after a page reload.
- **Malformed case export** — the cases CSV export does not quote every field, so the date column splits into two.
- **Hardcoded counts** — the sidebar case badge, the Evaluation page totals and the notification badge do not change.
- **Keyword-based checklist** — the required-document checklist matches filenames by keyword, so the "complete" demo case shows two items as missing.
- **Simple demo engine** — for example, the first pair of capitalised words is taken as the client name, and results on seeded cases can differ from the hand-written examples.
- **LLM mode untested** — it has not been run with a live key, and its output is not validated against a schema.
- **Static "Demo Mode" labels** — they are shown even when an LLM key is configured.
- **No OCR** — scanned PDFs return no text, and only PDFs have real page numbers.
- **Google Drive is simulated.**
- **No role-based authorization** — any signed-in user can view and change all cases.

## Documentation

| Document | What it covers |
|---|---|
| [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md) | The original brief, the problem, our solution and approach, and how the system works |
| [CONTEXT.md](./CONTEXT.md) | Verified project context: feature status, architecture, data model, API reference, known issues and roadmap |
| [AGENTS.md](./AGENTS.md) | Guide for developers and AI coding assistants: setup, conventions, rules for safe changes and validation |

## Team

Built by **Team HACKSMITHS** for the **Build for Campus 2026** hackathon.

## License and disclaimer

This repository does not include a license file yet. CaseClarity AI is a prototype built with fictional data. It is not legal advice and must not be used to make legal decisions.
