<div align="center">

# CaseClarity AI

**AI does the reading. Humans make the decisions. Every recommendation is traceable to evidence.**

An explainable, human-in-the-loop case preparation workspace for legal-aid nonprofits —
eviction defences, benefits appeals, employment claims and immigration filings.

Built by **Team HACKSMITHS** for **HACKSMITHS — Build for Campus 2026**

[![Demo deployment](https://img.shields.io/badge/demo_deployment-link-0B7285?logo=cloudflare&logoColor=white)](https://caseclarity-ai.eayub006.workers.dev)
[![CI](https://github.com/eayub006-source/caseclarity-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/eayub006-source/caseclarity-ai/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-112_passing-2E7D32)](https://github.com/eayub006-source/caseclarity-ai/tree/main/tests)
[![License](https://img.shields.io/badge/license-none-lightgrey)](#license)

[![Status](https://img.shields.io/badge/status-browser_local_demo-6B7280)](#project-state-demo-history-and-production-target)
[![Backend](https://img.shields.io/badge/backend-PostgreSQL_%28planned%29-4169E1?logo=postgresql&logoColor=white)](#historical-postgresql-implementation-commit-34dd6c0)

[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.3.1-149ECA?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1.17-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![Vitest](https://img.shields.io/badge/Vitest-5.1-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)

[Demo deployment](https://caseclarity-ai.eayub006.workers.dev) ·
[Repository](https://github.com/eayub006-source/caseclarity-ai) ·
[Demo guide](#product-demonstration) ·
[Architecture](#architecture) ·
[Run locally](#local-setup)

</div>

> **Prototype notice.** CaseClarity AI is a hackathon prototype, not legal advice and not a replacement
> for a qualified legal professional. Every case, client, document and metric in the demo is fictional.
> Confidence scores are uncalibrated heuristics, not probabilities.
>
> **Where this project stands.** The repository currently runs as an **interim browser-local demo**:
> case data, accounts and sessions live in each visitor's IndexedDB and there is no database.
> PostgreSQL is the **intended production backend**. A complete PostgreSQL + Drizzle ORM implementation
> is preserved in Git history at commit `34dd6c0` and is the verified historical reference for the
> intended production architecture's schema, API routes and authentication. The final production schema
> still requires engineering review. The planned return to PostgreSQL through Cloudflare
> Hyperdrive is **not implemented, configured or deployed**. See
> [Project state](#project-state-demo-history-and-production-target).

---

## Contents

1. [The problem](#the-problem)
2. [Our solution](#our-solution)
3. [Key features](#key-features)
4. [How it works](#how-it-works)
5. [Product demonstration](#product-demonstration)
6. [Project state: demo, history and production target](#project-state-demo-history-and-production-target)
7. [Technology stack](#technology-stack)
8. [Architecture](#architecture)
9. [Historical PostgreSQL implementation (commit `34dd6c0`)](#historical-postgresql-implementation-commit-34dd6c0)
10. [Data storage](#data-storage)
11. [API reference](#api-reference)
12. [Local setup](#local-setup)
13. [Environment variables](#environment-variables)
14. [Testing and code quality](#testing-and-code-quality)
15. [Security, privacy and responsible AI](#security-privacy-and-responsible-ai)
16. [Limitations and future work](#limitations-and-future-work)
17. [Project structure](#project-structure)
18. [Documentation](#documentation)
19. [License](#license)

---

## The problem

A caseworker at a small legal-aid nonprofit typically holds a pile of documents that arrived by email,
scan and post: a lease, a 14-day notice, three pay stubs, an emergency-room bill, a rent ledger.
A benefit denial letter, a termination letter, an email thread with HR, a custody order. The client's
deadline is days away.

The work is real, but it is dominated by manual reading:

- **High document volume.** Facts that decide a case are scattered across dozens of pages in
  incompatible formats, and every case starts the reading from zero.
- **Conflicting information.** Two pay figures disagree; a "position elimination" was followed by a
  job posting. These contradictions are exactly the facts that matter, and they are easy to miss.
- **Missing evidence.** Appeals are lost because one required document was never collected, and the
  gap is only discovered at filing time.
- **Manual, undocumented preparation.** Reasoning lives in a caseworker's head or in a scratch note,
  so nobody can review how a conclusion was reached.
- **Generic AI tools are not usable here.** A chat model that answers "what should I do?" produces
  text with no source, no page, no way to audit the claim, and no record of who approved it. For
  legal aid, an unverifiable recommendation is worse than no recommendation.

The cost of these problems is borne by people who cannot afford to lose: a family facing eviction,
a client whose benefits were cut off, a worker who was dismissed after requesting an accommodation.

## Our solution

CaseClarity AI turns a case file into **source-cited facts, explicit gaps and one explainable
recommendation** — then stops and hands the decision to a human.

| Principle | How the product enforces it |
|---|---|
| Evidence-backed fact extraction | Every fact carries its document name, page number, a verbatim snippet and a confidence value |
| Page-level citations | PDFs are read page by page, so "rent is $1,450" points at the page where it says so |
| Citation verification | On the Live AI path, every fact, evidence item and contradiction side is matched against the text that was actually submitted; mismatches are marked **Unverified** |
| Contradiction detection | Conflicts are stored as structured records with **at least two independently traceable sides**; a conflict that cannot cite two sides is dropped, not shown |
| Missing-document identification | A required-document checklist per case type, matched on file name *and* content, produces a completeness score |
| Explainable recommendations | Reasoning, evidence, confidence, missing information, uncertainties and numbered next steps — every time |
| Human approval and review | New recommendations are always `pending`; only a signed-in person can approve, modify or reject one, and the decision is locked afterwards |
| Append-only audit trail | Uploads, analyses, imports, exports, reviews, deletions and resets are recorded with actor, category and timestamp |

**The loop is deliberately narrow.** The system never states a legal conclusion, never marks its own
work as approved, and never hides a gap. When the documents do not support a conclusion, the Live AI
path requires the model to say so, and the recommendation is labelled as insufficiently evidenced.

## Key features

### Implemented features

| Area | What actually works |
|---|---|
| **Case management** | Create, list, search (title, client, case number), filter (status, case type) and delete cases (senior roles only). Case numbers are assigned as `CC-<year>-<NNN>`. Deleting a case removes its documents, facts and recommendations but keeps its audit history and records a deletion entry. |
| **Document upload and extraction** | PDF (real per-page text via PDF.js/`unpdf`), DOCX (`mammoth`), TXT, CSV and MD. 10 MB per file. Extraction runs **in the browser**; only extracted text is kept. |
| **Fact extraction** | The demo engine labels dates by nearby context (deadline, effective date, date of birth…), labels amounts by the closest keyword (rent, income, arrears, bill, debt…), annualises income when a period is given, and records document, page and snippet for each fact. |
| **Citation verification** | Server-side for Live AI: unknown documents, quotes not found in the text, and contradictions with fewer than two verified sides are handled explicitly (see [guardrails](#live-ai-guardrails)). |
| **Contradiction detection** | Different annual incomes, different monthly rents, and a "position eliminated / refilled" timeline conflict. Each side keeps its own document, page and quoted snippet. |
| **Missing-document detection** | Required-document checklist per case type with synonym matching (`Pay_Stubs_Mar2026.pdf` satisfies *Proof of Income*), a completeness percentage, and a checklist panel on the case. |
| **AI recommendations** | One pending recommendation per analysis with reasoning, cited evidence, contradictions, missing information, uncertainties, next steps and engine label. Re-running analysis replaces the case's facts and adds a new recommendation. |
| **Human review workflow** | Approve (marks the case completed), modify (requires replacement text, keeps the AI's original evidence), reject, add a comment, request documents, or flag for investigation. Approved and rejected recommendations are locked. |
| **Audit trail** | Per-case timeline and a global searchable timeline with category filters; CSV export. Records actor, action, details, category and timestamp. |
| **AI document summaries** | On the Live AI path, a short summary plus cited highlights per document, displayed on the case's Documents tab and stored in the visitor's browser. |
| **CSV import and export** | RFC 4180 parsing (PapaParse), tolerant column mapping, mixed-date handling, duplicate detection (client + title), an import report, a downloadable sample CSV, and export of cases and audit events. |
| **Demo Mode and Live AI** | Both paths exist and are labelled everywhere (mode badge, per-recommendation engine badge, audit wording). Demo Mode needs no API key and makes no provider call. |
| **Roles** | `case_worker`, `senior_case_worker` and `admin`; only the last two can delete cases or reset demo data. |
| **Cloudflare deployment** | Builds and serves the app plus three stateless API routes from a Cloudflare Worker via `vinext`. No database binding is configured in this demo. |

### Simulated or illustrative features

These are **not** working integrations or measured results, and the interface says so:

| Feature | Reality |
|---|---|
| **Google Drive import** | Simulated. Five fictional file rows, a case picker and placeholder text stored as `Google Drive (simulated)`. No OAuth, no Drive API, no real file content. |
| **Evaluation metrics** | Illustrative placeholders defined in `EVALUATION` (`src/lib/core.ts`) and labelled as such on the Evaluation page. No user study, benchmark or accuracy measurement has been run. The workspace totals on that page *are* live counts. |
| **Confidence scores** | Uncalibrated heuristics in both modes. The UI labels them as heuristic-only. |
| **Demo accounts** | Public by design (password shown on the sign-in page) and stored in the browser. They identify who did what in the audit trail; they are not an authentication boundary. |
| **Demo dataset** | Fictional cases, documents, facts, recommendations and audit history, seeded from `src/data/demo-data.ts`. |

### Not implemented

OCR for scanned PDFs · legacy `.doc` files · real page boundaries for DOCX · keeping the original
uploaded files · a shared workspace across devices or team members · server-side sessions and database
persistence (the historical PostgreSQL implementation only) · password reset · organisation
administration · real Google Drive OAuth · server-enforced audit immutability · committed end-to-end
browser tests · measured evaluation results.

## How it works

```mermaid
flowchart TD
    A["Upload documents<br/>PDF · DOCX · TXT · CSV · MD"] --> B["Extract text in the browser<br/>PDF.js and mammoth · page boundaries kept"]
    B --> C{"Live AI configured?"}
    C -->|"No — Demo Mode"| D["Deterministic rule engine<br/>src/lib/core.ts"]
    C -->|"Yes — Live AI"| E["POST /api/analyze<br/>server-side LLM call"]
    E --> F["Verify every citation<br/>against the submitted text"]
    D --> G["Pending recommendation<br/>reasoning · evidence · confidence · gaps · next steps"]
    F --> G
    G --> H{"Human review"}
    H -->|"Approve"| I["Case marked completed<br/>recommendation locked"]
    H -->|"Modify or Reject"| J["Decision recorded and locked"]
    H -->|"Missing documents"| K["Request documents<br/>from the client"]
    K --> A
    I --> L["Audit trail<br/>append-only · CSV export"]
    J --> L
```

1. **Upload** — drag and drop (or browse) into a case. The file is read in the browser; the original
   file is never uploaded or stored.
2. **Extract** — text is extracted page by page. PDFs keep real page numbers; DOCX/TXT/CSV/MD are split
   into estimated pages at paragraph boundaries, and the UI says which is which.
3. **Analyse** — *Run AI Analysis* extracts facts, checks the case type's required-document checklist and
   looks for contradictions, using either the demo engine or the configured LLM.
4. **Verify** — on the Live AI path the server matches every citation against the submitted text before
   anything is saved.
5. **Recommend** — a `pending` recommendation is stored with its evidence, gaps, doubts and next steps.
6. **Human review** — a signed-in caseworker approves, modifies, rejects, requests documents or flags the
   case. Approving marks the case completed.
7. **Audit** — every step above is appended to the audit trail with the actor and a timestamp.

### Demo Mode versus Live AI

| | Demo Mode | Live AI |
|---|---|---|
| Enabled when | `LLM_API_KEY` is empty, the provider fails, returns invalid JSON, times out, or its output fails validation | `LLM_API_KEY` is set and the provider responds with usable structured JSON |
| Where it runs | Entirely in the browser (`runAnalysis()` in `src/lib/core.ts`) | `POST /api/analyze` on the server, calling an OpenAI-compatible Chat Completions API |
| Network traffic | No outbound request for the analysis itself (the app still makes a same-origin `GET /api/config` to label the UI) | Case title, client name, case type and the extracted text of that case's documents (trimmed to a 60,000-character prompt budget), posted to `/api/analyze` |
| Output | Rule-based facts, checklist gaps, comparable-value contradictions, heuristic recommendation | Structured JSON from the model: facts, contradictions, missing items, document summaries, recommendation — all citation-checked server-side |
| Labelling | "Demo Mode" badge, `Demo engine` badge on the recommendation, audit entry `AI analysis completed (Demo Mode)` | "Live AI (model)" badge, `Live AI` badge, audit entry naming the model (and naming the primary model when a fallback answered) |
| Fallback behaviour | — | Any provider or validation failure returns `mode: "demo"` with a human-readable reason; the browser then runs the demo engine and the audit records why |

### Live AI guardrails

These are the checks in `src/lib/llm.ts` and `src/app/api/analyze/route.ts`, not prompt suggestions:

- **Verbatim citations only.** Documents are delimited by `=== DOCUMENT: name ===` and pages by
  `--- PAGE n ---`; the model must quote text and name a real file.
- **Server-side verification.** Unknown file names, quotes that do not appear in the text, and wrong page
  numbers are resolved against the submitted documents. Unverifiable facts are marked `verified: false`
  with confidence capped at 40, and the UI shows an **Unverified** badge.
- **Contradictions need two sides.** A contradiction with fewer than two verified sides is dropped.
- **Insufficient evidence is explicit.** If the model sets `sufficientEvidence: false`, confidence is
  capped at 60 and an uncertainty is added.
- **Bounded output.** At most 100 facts, 20 evidence items, 10 contradictions and 50 document summaries
  are accepted per response.
- **Bounded retries.** Transient faults (429, 500, 502, 503, 504, timeouts, network errors) are retried
  with exponential backoff and jitter; a 404 skips to the fallback model; **401/403 are never retried**
  because every model uses the same key.
- **No key leakage.** Provider error bodies are never copied into messages, because they can echo part of
  the API key and those messages are visible in the audit trail.
- **Safe degradation.** Timeouts, HTTP errors, unparseable JSON and rejected output all return
  `mode: "demo"` with a reason instead of an error page.

## Product demonstration

**Live demo:** <https://caseclarity-ai.eayub006.workers.dev>

### Demo credentials

| Name | Email | Password | Role |
|---|---|---|---|
| Alex Rivera | `demo@caseclarity.ai` | `demo1234` | Senior Case Worker |
| Jordan Lee | `caseworker@caseclarity.ai` | `demo1234` | Case Worker |

Both accounts belong to the fictional organisation *Northside Legal Aid*. The sign-in page also offers
one-click buttons for each account, and new accounts can be created on `/signup` (stored in that browser
with a bcrypt hash).

### Roles and permissions

| Capability | Case Worker | Senior Case Worker / Admin |
|---|---|---|
| Open cases, upload documents, run analysis | Yes | Yes |
| Approve, modify or reject recommendations | Yes | Yes |
| Request documents, flag a case for investigation | Yes | Yes |
| Delete a case (two-click confirmation) | No | Yes |
| Reset the workspace to the demo dataset | No | Yes |

Roles are enforced in the client-side store (`src/lib/store.tsx`) and reflected in the UI; they are not a
server-side authorisation boundary — see [Security](#security-privacy-and-responsible-ai).

### A three-minute walkthrough

| Time | Where | What to notice |
|---|---|---|
| 0:00–0:20 | Landing page `/` | The product statement and the honest scope: fictional data, not legal advice |
| 0:20–0:40 | `/login` | One-click sign-in as **Alex Rivera** (Senior Case Worker) |
| 0:40–1:05 | `/dashboard` | Live counts, cases by status, the pending-review queue and the AI-mode badge |
| 1:05–1:40 | Case `CC-2026-003` → **Analysis** tab | Facts with document, page, confidence and snippet; the `$62,000` vs `$69,600` contradiction shown with both sides cited |
| 1:40–2:10 | **Recommendation** tab | Reasoning, evidence, confidence labelled uncalibrated, missing information, uncertainties, next steps |
| 2:10–2:35 | **Human Review** panel | Approve with a comment, then open the **Audit** tab: the decision is recorded under your name and the recommendation is locked |
| 2:35–3:00 | Case `CC-2026-002` → **Overview**, then `/integrations` | The four missing documents for a SNAP appeal; CSV import/export beside the clearly labelled **Simulated** Google Drive |

### Screens worth opening

- **`/cases` → `CC-2026-002`**: missing-document handling, a case status of *Missing documents*, and four
  gaps on the required-documents checklist.
- **`/cases` → `CC-2026-001`**: a complete file at 100% completeness with a superseded/sample recommendation.
- **`/upload`**: real browser-side extraction, with per-file status and warnings for scanned PDFs.
- **`/audit`**: the global timeline, search, category filters and CSV export.
- **`/evaluation`**: the illustrative metrics, plainly labelled, next to live workspace totals.
- **`/integrations`**: the honesty line — "Google Drive is simulated; CSV import/export is real".

## Project state: demo, history and production target

Three distinct things are easy to confuse in this repository. They are not interchangeable:

| Layer | What it is | Status |
|---|---|---|
| **Current implementation** (baseline commit `f236509`) | Next.js + React workspace where every case, account, session and audit entry lives in the visitor's IndexedDB; three stateless API routes; optional Cloudflare Worker deployment via `vinext` | **Interim demo.** This is the checked-out baseline implementation. There is no database. |
| **Historical implementation** (commit `34dd6c0`) | Next.js + PostgreSQL 15 + Drizzle ORM, server-side sessions, bcrypt accounts, authenticated REST API, seven tables | **Previously implemented and verified in Git history.** It is a historical reference for the intended production architecture, not a production-readiness claim; its schema, API and authentication design require engineering review before production use. It is not the code in the working tree. |
| **Intended production architecture** | PostgreSQL behind Cloudflare Hyperdrive, server-side sessions, authenticated API, shared workspace | **Planned.** No Hyperdrive binding, PostgreSQL connection, migration or production database exists in this repository. |

**Do not read the demo as the product architecture.** "No database" is a deliberate property of the
interim build, not the intended end state. Equally, the PostgreSQL implementation at `34dd6c0` is a
historical reference, not a running service: its files (`src/db/schema.ts`, `src/db/index.ts`,
`drizzle.config.ts`, the authenticated route handlers) are absent from the baseline commit `f236509`.

The migration path is documented in [Limitations and future work](#limitations-and-future-work):
restore the `34dd6c0` schema, add a storage adapter, reintroduce server-side authentication, and put
Cloudflare Hyperdrive between the application and PostgreSQL.

## Technology stack

Versions are taken from `package.json` and the build configuration. The first table is the **current
demo**. The historical PostgreSQL stack and the planned production stack follow it.

### Current demo (baseline commit `f236509`)

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, React Server Components) | 16.4.6 |
| UI | React / React DOM, all workspace pages are client components | 19.3.1 |
| Language | TypeScript (strict) | 5.9.3 |
| Styling | Tailwind CSS v4 with `@tailwindcss/postcss` | 4.1.17 |
| Icons | lucide-react | ^1.73.0 |
| Browser storage | IndexedDB, no wrapper library (`src/lib/browser-db.ts`) | Web API |
| PDF extraction | `unpdf` (Mozilla PDF.js) | ^1.9.1 |
| DOCX extraction | `mammoth` browser build | ^1.13.0 |
| CSV | `papaparse` | ^5.7.1 |
| Password hashing | `bcryptjs` (bcrypt, cost 10) | ^3.0.3 |
| Hosting | Cloudflare Workers via `vinext` + `@cloudflare/vite-plugin` + Vite | 1.4.6 / 2.0.0-rc.3 / 8.3.8 |
| Cloudflare CLI | `cf` (used by `@vinext/cloudflare`) | 1.0.0-rc.2 |
| Tests | Vitest | ^5.1.0 |
| Linting | ESLint 9 with `eslint-config-next` (`core-web-vitals`) | 9.39.4 / 16.4.6 |
| AI integration | Any OpenAI-compatible Chat Completions API, called with `fetch` (no SDK) | — |
| CI | GitHub Actions (Node 22) | — |

The current demo has **no ORM, no SQL client and no database driver**. Node.js 22 or newer is required
for tooling (CI pins Node 22; the `cf` CLI warns below 22.23.0).

### Historical stack at commit `34dd6c0`

These are the dependencies and files present in the PostgreSQL implementation, verified directly from
that commit:

| Layer | Technology | Version |
|---|---|---|
| Database | PostgreSQL 15 | 15.x (README of that commit states 15, tested with 15.19) |
| ORM | Drizzle ORM | 0.45.2 |
| Schema tooling | drizzle-kit | 0.31.10 |
| PostgreSQL driver | `pg` | 8.20.0 |
| Driver types | `@types/pg` | 8.18.0 |
| Password hashing | `bcryptjs` | ^3.0.3 |
| Framework | Next.js | 16.4.6 |

Schema and client files: `src/db/schema.ts` and `src/db/index.ts`; tooling: `drizzle.config.ts` and the
`db:push` script. See [Historical PostgreSQL implementation](#historical-postgresql-implementation-commit-34dd6c0).

### Planned production stack

| Layer | Intended technology | Status |
|---|---|---|
| Database | PostgreSQL, using the seven-table schema from `34dd6c0` as the reference | Planned; no database exists in this repository |
| Connection pooling / caching | Cloudflare Hyperdrive in front of PostgreSQL | Planned; no Hyperdrive binding or configuration exists |
| ORM | Drizzle ORM, restoring the `34dd6c0` schema and `drizzle-kit` workflow | Planned; no migration has been written |
| Authentication | Server-side sessions and bcrypt, restoring the `34dd6c0` design | Planned; the current demo uses browser-local accounts |
| Hosting | Cloudflare Workers (current demo deployment target) | Current demo only; no database is bound |

No version, provider region, database host, credential or Hyperdrive configuration is asserted here,
because none is defined in the repository.

## Architecture

The diagram below describes **only the current IndexedDB demo**. The production-target architecture
that follows is planned, not configured or deployed.

```mermaid
flowchart TB
    subgraph BROWSER["Current demo: browser"]
        UI["React workspace"] --> STORE["StoreProvider + workspace rules"]
        STORE --> IDB[("IndexedDB: workspace · accounts · session")]
        STORE --> EXT["Browser extraction: unpdf · mammoth"]
        UI --> DEMO["Local deterministic demo analysis"]
    end
    subgraph WORKER["Current demo: stateless Cloudflare Worker"]
        ROUTES["POST /api/analyze · GET /api/config · GET /api/health"]
        LLM["Prompt · retries · citation verification"]
        ROUTES --> LLM
    end
    PROVIDER["External OpenAI-compatible AI provider<br/>outside the Worker"]
    STORE -. "Live AI only: case fields + extracted text" .-> ROUTES
    UI -. "reads mode for badge" .-> ROUTES
    LLM -. "HTTPS + Bearer key" .-> PROVIDER
```

**Current demo boundaries:**

1. **Persistence is browser-local.** Cases, documents, extracted text, facts, recommendations, summaries,
   accounts, session identity and audit entries are stored in each visitor's IndexedDB. There is no
   database, server-side session or shared workspace in the current tree.
2. **The Worker is stateless.** It serves the app and three JSON routes. For Live AI it holds the provider
   key, builds a prompt, calls the provider, verifies citations and returns JSON; it does not persist the
   workspace.
3. **Live AI is the data-flow exception.** When enabled, the case fields and extracted text for that
   analysis are sent to `/api/analyze`, then to the configured AI provider. Demo Mode analysis is local.

The intended server-backed production direction changes this boundary:

```mermaid
flowchart LR
    B["Browser client"] -->|"authenticated API requests"| W["Cloudflare Worker / application API"]
    W -->|"planned binding"| H["Cloudflare Hyperdrive"]
    H -->|"pooled connection"| PG[("PostgreSQL")]
    W -->|"Live AI request only"| AI["Configured AI provider"]
```

**Everything in the second diagram is a target, not existing infrastructure.** No Hyperdrive binding,
PostgreSQL connection, server-side storage adapter, or database deployment is present in this checkout.
The target is based on the verified implementation in [`34dd6c0`](#historical-postgresql-implementation-commit-34dd6c0),
with Hyperdrive as the planned Cloudflare-to-PostgreSQL connection layer. Its exact deployment design
and operational controls remain to be implemented and verified.

## Historical PostgreSQL implementation (commit `34dd6c0`)

This section records source inspected directly at commit
[`34dd6c0457615e53642569ff35f5d449656d9c6f`](https://github.com/eayub006-source/caseclarity-ai/commit/34dd6c0457615e53642569ff35f5d449656d9c6f).
It describes a historical implementation, not the current application or a live deployment.

### Database schema

`src/db/schema.ts` defines seven PostgreSQL tables with Drizzle `pg-core`:

| Table | Historical columns and relationships |
|---|---|
| `users` | UUID primary key; unique email; name, password hash, role (default `case_worker`), organization, creation timestamp |
| `cases` | UUID primary key; unique case number; title, client name, case type, status (`awaiting_review` default), priority (`medium` default), description, assignee, completeness, created/updated timestamps |
| `documents` | Case foreign key with cascade delete; name, type, size, status (`uploaded` default), extracted text, source, page count, upload timestamp |
| `extractions` | Case foreign key with cascade delete; document foreign key set to null on document deletion; field name/value, confidence (default 80), source document/page/snippet, category (`fact` default), verified flag (default true), timestamp |
| `recommendations` | Case foreign key with cascade delete; title, summary, reasoning, confidence (default 70), status (`pending` default), engine (`seed`, `demo` or `llm`), JSONB evidence/contradictions/missing information/uncertainties/next steps, review fields and timestamps |
| `sessions` | User foreign key with cascade delete; unique token hash, expiry and creation timestamps |
| `audit_logs` | Case foreign key set to null on case deletion so audit history can survive; actor, action, details, category (`general` default), timestamp |

These tables and constraints describe that commit's schema. They are **not** present at baseline
commit `f236509`, and no current migration or database exists.

### Drizzle, PostgreSQL connection and schema workflow

At `34dd6c0`:

- `drizzle.config.ts` loads `dotenv/config`, requires `DATABASE_URL`, and configures Drizzle Kit with
  `dialect: "postgresql"`, schema `./src/db/schema.ts`, and the URL from that environment variable.
- `src/db/index.ts` creates a `pg.Pool` and a Drizzle node-postgres client. It requires `DATABASE_URL`,
  caches the pool on `globalThis.__arenaNextJsPostgresqlPool` outside production, and passes
  `options: "-c timezone=UTC"` to align timestamps with the schema's `timestamp without time zone` fields.
- The historical `package.json` included `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `pg` 8.20.0,
  `@types/pg` 8.18.0 and `dotenv` 17.3.1. It defined `npm run db:push` as `drizzle-kit push`.
- `.env.example` documented `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db` as a
  **local example**, not a live credential. Other historical variables included `DEMO_ACCOUNT`,
  `TRUST_PROXY`, `TRUSTED_IP_HEADER`, `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL`.

The historical setup used PostgreSQL 15 and Drizzle's push workflow; no `db:generate` or
`db:migrate` script was defined in that commit. Do not copy the example URL into a deployment or assume
it names an existing database.

### Historical authentication and authorization

At that commit, `src/lib/auth-server.ts` implemented server-side sessions. It generated a random
256-bit token, stored only its SHA-256 hash in `sessions.token_hash`, and set the `cc_session` cookie
with `httpOnly`, `sameSite: "lax"`, `path: "/"`, seven-day expiry and `secure` in production.
It exposed session creation/destruction, current-user lookup, `requireUser`, `unauthorized`, `forbidden`
and manager-role helpers. Expired sessions were cleaned up on login.

`src/lib/password.ts` used `bcryptjs` cost 10 and a minimum password length of 8. `src/lib/roles.ts`
defined `case_worker`, `senior_case_worker` and `admin`; senior case workers and admins could manage.
Signup created `case_worker` accounts and rejected the demo email. The optional demo account
(`demo@caseclarity.ai` / `demo1234`, `senior_case_worker`, `Northside Legal Aid`) was created on demand
only when `DEMO_ACCOUNT` enabled it. The auth route used atomic rate-limit reservations and refunds for successful attempts. Its historical
limits were 30 failed attempts per email, 10 per email+IP, and 50 per IP per 15-minute window; signup
was limited to 10 per IP per hour or 200 globally. Throttling returned `Retry-After`; signup required
8–200 characters and login/signup inputs were bounded. These are historical code facts, not assurances
about the current demo or a future deployment.

### Historical API routes

The individually listed endpoint paths below were present at `34dd6c0`; they are **not** the three
routes exposed by the current demo at baseline commit `f236509`. Each route and method is listed from
its historical source; no aggregate endpoint count is needed here. All case-data routes called
`requireUser()` and returned `401` when unauthenticated, except the explicitly public endpoints listed
below.

| Endpoint | Methods | Historical behavior and access |
|---|---|---|
| `/api/auth` | GET, POST | Public session lookup; POST login, signup or logout. Sets/destroys the server session cookie. |
| `/api/health` | GET | Public `select 1` database check; returns 200 `{ok:true}` or 500 `{ok:false}`. |
| `/api/config` | GET | Public AI mode/model and demo-account configuration; no secret returned. |
| `/api/cases` | GET, POST | Authenticated list/create; POST also accepted bulk CSV import up to 500 rows with deduplication. |
| `/api/cases/[id]` | PATCH, DELETE | Authenticated updates; DELETE restricted to manager roles. |
| `/api/documents` | GET, POST | Authenticated document listing/creation. |
| `/api/extract` | POST | Authenticated file extraction; 10 MB limit, 413 over limit, 415 unsupported type, 422 unreadable file. |
| `/api/extractions` | GET, POST, DELETE | Authenticated extraction listing, creation and deletion. |
| `/api/recommendations` | GET, POST | Authenticated recommendation listing and creation. |
| `/api/recommendations/[id]` | PATCH | Authenticated review/update; 409 when already locked. |
| `/api/audit` | GET, POST | Authenticated audit listing and event creation. |
| `/api/analyze` | POST | Authenticated analysis; LLM HTTP errors or invalid JSON fell back to `{mode:"demo"}`, otherwise `{mode:"llm"}`. |
| `/api/seed` | POST | Manager-only; 403 when demo mode disabled and guarded against reseeding. |

In the historical source, manager-only operations included case deletion and seeding; the session,
password, rate-limit and authorization implementation was in server-side libraries, not the browser
store. This historical API list does not imply these endpoints, protections or database are available
in the current demo.

## Data storage

### Current IndexedDB demo

| Data | Current location | Detail |
|---|---|---|
| Original uploaded files | Nowhere after extraction | Read in browser memory; originals are neither uploaded nor persisted. |
| Documents and extracted text | Browser IndexedDB | Key `workspace` → `docs[]`; pages are joined with `\f` to preserve page boundaries. |
| Facts and extractions | Browser IndexedDB | `workspace.extractions[]` with source document, page, snippet, confidence, category and verification flag. |
| Recommendations and review decisions | Browser IndexedDB | `workspace.recs[]` with evidence, contradictions, status, reviewer, comment and engine. |
| AI document summaries and highlights | Browser IndexedDB | `workspace.summaries[]`, created by Live AI. |
| Audit trail | Browser IndexedDB | `workspace.audit[]`; deletions keep history and unlink the case. |
| Local accounts | Browser IndexedDB | `accounts` key includes email, role, org and bcrypt hash; the password is not stored. |
| Signed-in session | Browser IndexedDB | `session` key stores `{ userId }`; this is not a server-authenticated session. |
| Server-side persistence | None | Current routes do not store workspace state. |
| PostgreSQL / Hyperdrive | None in current tree | No `src/db/`, database driver, database binding or Hyperdrive configuration. |

**Implementation notes** (`src/lib/browser-db.ts`, `src/lib/workspace.ts`):

- IndexedDB database `caseclarity-ai` has one object store, `kv`; the workspace is versioned
  (`WORKSPACE_VERSION = 2`). An older or unreadable copy is replaced with the seeded demo dataset.
- Storage calls resolve rather than throw. In a private window or with site data blocked, the app keeps
  working in memory and warns that changes will be lost on reload.
- *Reset demo data* restores `src/data/demo-data.ts` and appends a reset event to the local audit trail.
- Each browser profile/device has its own workspace. Clearing site data restores the seed; separate tabs
  can overwrite each other (last write wins).
- The workspace is not partitioned by local account: accounts in one browser see the same cases and audit
  trail. Sign-in identifies the actor but does not isolate data.
- First visit seeds six fictional cases, 19 documents, 20 curated facts, six sample recommendations and
  14 audit events.

### Intended server-side persistence

When server-side persistence returns, data will no longer be confined to the visitor's browser. The
intended architecture is a shared PostgreSQL-backed workspace, using the verified seven-table schema at
[`34dd6c0`](#historical-postgresql-implementation-commit-34dd6c0) as the reference and Cloudflare
Hyperdrive as the planned connection layer. This is **not implemented**: there is no database or
Hyperdrive binding, no current database schema, and no live server-side data store. Retention, tenancy,
backup, deletion and operational policies must be designed and documented before production use.

The historical schema mapped users, cases, documents, extractions, recommendations, sessions and audit
logs to relational records. It does not mean that current demo data is uploaded or synchronized. There
is no `/api/summaries` route in the current codebase.

## API reference

### Current demo API

The current demo at baseline commit `f236509` exposes three stateless routes under `src/app/api/`.
They return JSON and do not persist case data. They are separate from the authenticated PostgreSQL API
documented in the historical section above.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness probe; no database check. |
| `GET` | `/api/config` | Non-secret runtime AI mode/model for UI labeling. |
| `POST` | `/api/analyze` | Live AI analysis of submitted case fields and extracted text; citations are checked server-side. |

`GET /api/health` returns `200` with `{"ok": true}`. `GET /api/config` returns the active AI mode, for
example `{ "aiMode": "demo", "model": null }`. `aiMode` is `"llm"` when `LLM_API_KEY` is configured,
otherwise `"demo"`; no secret is returned. Neither route checks PostgreSQL because the current demo
has no database.

### `POST /api/analyze`

#### Request

```json
{
  "case": { "title": "Eviction Defense", "clientName": "Maria Gonzalez", "caseType": "Housing / Eviction" },
  "documents": [{ "id": "doc-1", "name": "Lease_Agreement.txt", "extractedText": "..." }]
}
```

The browser trims documents to a 60,000-character prompt budget, sends at most 50 documents, and sends
only the case fields listed above—not the workspace, audit trail or accounts.

**Response — Live AI (`200`)**

```json
{
  "mode": "llm",
  "model": "gemini-3.8-flash",
  "primaryModel": "gemini-3.8-flash",
  "fallbackUsed": false,
  "attempts": 1,
  "result": {
    "facts": [],
    "contradictions": [],
    "missing": [],
    "documentSummaries": [],
    "recommendation": {},
    "unverifiedCount": 0
  }
}
```

This is an illustrative response shape; the model fields reflect configured values and do not assert
which model, if any, is live. `model` is the model that answered; `primaryModel` is the configured
primary, so the audit trail can show when a fallback model answered.

**Response — fallback (`200`)**

```json
{ "mode": "demo", "reason": "No LLM_API_KEY configured — using the local demo engine." }
```

The route returns `mode: "demo"` when no key is configured, the provider errors or times out, the
response is invalid JSON, or output validation fails. The browser then runs the local demo engine and
records the reason.

#### Errors

| Status | When | Response body / headers |
|---|---|---|
| `400` | No usable document in the request | `{"error": "Upload at least one document first"}` |
| `403` | Cross-site browser request (Origin or `Sec-Fetch-Site` mismatch) | `{"error": "Cross-site request blocked"}` |
| `413` | Declared body exceeds approximately 1.2 MB | `{"error": "Request too large"}` |
| `413` | Total extracted document text exceeds 600,000 characters | `{"error": "Documents are too large to analyze"}` |
| `429` | More than 10 Live AI analyses per minute for one visitor | `{"error": "Too many AI analyses from your connection. Wait a minute and try again."}`; `Retry-After: 60` |

**Access control.** The route blocks cross-site browser requests and, on Cloudflare, uses a rate-limit
binding for 10 Live AI analyses per minute per visitor. These controls are not user authentication:
anyone who can access a public deployment can call the endpoint. A provider spending limit is prudent.
The local limiter is absent during local development.

**Configuration.** Request timeouts, transient-fault retries and model fallback are handled in
`postChatCompletion()`; see [Environment variables](#environment-variables).

## Local setup

### Prerequisites

- **Node.js 22 or newer** (CI uses Node 22; `cf` warns below 22.23.0) and npm 10+
- Git
- No database, no Docker and no API key are required — the app starts in Demo Mode

### Steps

```bash
# 1. Clone
git clone https://github.com/eayub006-source/caseclarity-ai.git
cd caseclarity-ai

# 2. Install dependencies
npm ci           # or: npm install

# 3. Optional configuration (Demo Mode works without it)
cp .env.example .env

# 4. Start the Next.js dev server
npm run dev      # http://localhost:3000

# 5. Run the checks (all offline)
npm test
npm run typecheck
npm run lint
```

Open <http://localhost:3000>, go to **Try the demo**, and click one of the one-click demo accounts — or
sign in with `demo@caseclarity.ai` / `demo1234`. The workspace is seeded with six fictional cases on
first visit and saved in that browser.

### Working with the Cloudflare build

```bash
npm run dev:cloudflare      # vinext dev server on port 3001, using the Workers runtime
npm run build:cloudflare    # build the Worker (what gets deployed)
npm run preview:cloudflare  # run the built Worker locally with Vite preview
```

For the local Worker preview, copy `.dev.vars.example` to `.dev.vars` (gitignored) if you want Live AI;
leave `LLM_API_KEY` empty to stay in Demo Mode.

### Deploying the current demo to Cloudflare

The repository includes a **manual deployment workflow** (`workflow_dispatch`) and `npm run deploy`.
These describe a deployment procedure; their presence does **not** prove that a Worker currently exists,
is reachable, or is running this revision. The workflow targets a Worker named `caseclarity-ai` and
requires Cloudflare credentials and an LLM key when it writes secrets. No database or Hyperdrive setup
is part of that workflow.

```bash
# From your machine; requires your own Cloudflare account and authorization
npx cf auth login
npm run deploy
```

Or dispatch the **Deploy to Cloudflare Workers** workflow (`workflow_dispatch`) with an optional git ref
and a `stage-only` toggle. According to `.github/workflows/deploy-cloudflare.yml`, the workflow:

1. checks out the requested ref (or the dispatching ref when none is specified),
2. runs `npm test`, `npm run typecheck` and `npm run lint` as deployment gates,
3. when its `set-secrets` option is enabled, checks for `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID` and `LLM_API_KEY`, then writes and lists the configured Worker secrets,
4. builds and deploys the Worker named in `cloudflare.config.ts`; `stage-only` uploads a version without
   promoting it to receive traffic.

The workflow is configured to update the named Worker in place; dispatching it with an earlier commit
SHA is the documented rollback procedure, subject to valid account access and configuration. These
steps describe repository workflow logic, not proof that the needed account resources or credentials
exist, that a workflow succeeded, or that a live deployment is present. For deployment
verification, inspect the workflow result, test the actual endpoint (`/api/health` and `/api/config`),
and confirm the deployed revision through the applicable Cloudflare account tooling. This repository
does not assert current availability, deployment revision, live AI provider or production
infrastructure. The demo's `/api/health` is only a liveness response; it does not test PostgreSQL.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js development server on port 3000 |
| `npm run build` / `npm start` | Next.js production build / server |
| `npm run dev:cloudflare` | vinext dev server on port 3001 with the Workers runtime |
| `npm run build:cloudflare` | Build the Cloudflare Worker |
| `npm run preview:cloudflare` | Serve the built Worker locally |
| `npm run deploy` | Build and attempt deployment to the Worker named in the repository configuration (requires external Cloudflare setup) |
| `npm test` | Vitest unit test suite |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint over the repository |

> `npm run build` fetches the Geist font from Google Fonts at build time through `next/font`, so that one
> command needs outbound network access. The Cloudflare build does not.

## Environment variables

Every variable is optional. With none of them set, the app runs in Demo Mode.

| Variable | Default | Required | Purpose |
|---|---|---|---|
| `LLM_API_KEY` | *(empty)* | No — only for Live AI | Enables Live AI. A Google key starts with `AIza`. |
| `LLM_BASE_URL` | `https://api.openai.com/v1`, or Google's OpenAI-compatible endpoint when a Google key is detected and this is unset or still points at OpenAI | No | Base URL of an OpenAI-compatible API (the code appends `/chat/completions`) |
| `LLM_MODEL` | `gpt-4o-mini`, or `gemini-3.8-flash` when a Google key is detected and this is unset or looks like an OpenAI model | No | Model name sent to the provider |
| `LLM_TIMEOUT_MS` | `90000` | No | Provider request timeout in milliseconds, clamped to 5,000–300,000 |
| `LLM_FALLBACK_MODELS` | `gemini-3.5-flash-lite` | No | Comma-separated fallback models, tried in order when the primary is unavailable |
| `LLM_MAX_ATTEMPTS` | `3` | No | Total HTTP attempts shared across the model chain, clamped to 1–5 |
| `LLM_RETRY_BASE_DELAY_MS` | `1000` | No | Base delay for exponential backoff, clamped to 0–30,000 ms |

### How the values are resolved

- A key beginning with `AIza` is treated as a Google key. If `LLM_BASE_URL` is missing or still set to
  `api.openai.com`, the Google endpoint is used, and an OpenAI-style model name is replaced by
  `gemini-3.8-flash`. This prevents the "Incorrect API key provided" failure caused by sending a Gemini
  key to OpenAI.
- Timeout, attempt budget and backoff are clamped, so a bad value cannot produce an unbounded wait.

### Configuring Gemini

```dotenv
LLM_API_KEY=AIza...your-key...
# Optional — detected automatically for a Google key:
# LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
# LLM_MODEL=gemini-3.8-flash
```

### Configuring another OpenAI-compatible provider

```dotenv
LLM_API_KEY=your-provider-key
LLM_BASE_URL=https://your-provider.example/v1
LLM_MODEL=your-model-name
LLM_TIMEOUT_MS=90000
LLM_FALLBACK_MODELS=
```

### Where each runtime reads them

| Runtime | Current demo source |
|---|---|
| `npm run dev` (Next.js) | `.env` (copy `.env.example`) |
| Local Worker preview | `.dev.vars` (copy `.dev.vars.example`) |
| Worker deploy workflow | Workflow environment plus configured Worker bindings/secrets in `cloudflare.config.ts`; these are not proof that a live Worker is configured. |

The retry knobs (`LLM_MAX_ATTEMPTS`, `LLM_RETRY_BASE_DELAY_MS`) are not declared bindings on the Worker,
so Worker defaults apply unless the configuration is changed.

**Never commit `.env` or `.dev.vars`** — both are gitignored. The key is read server-side only
(`src/lib/server-config.ts`, the only current file that reads `process.env`); nothing sensitive uses
`NEXT_PUBLIC_*`, and the browser learns only the mode and model name from `GET /api/config`.

### Repository deployment configuration (not live-state verification)

| What source/config says | Value | What it does not establish |
|---|---|---|
| Deploy workflow's intended LLM settings | Gemini `gemini-3.8-flash` via `https://generativelanguage.googleapis.com/v1beta/openai/`, 90 s timeout | Whether credentials exist, the workflow has succeeded, or this configuration is live |
| Code defaults without `LLM_*` | `gpt-4o-mini` at `https://api.openai.com/v1` | Which provider or model any deployed Worker actually uses |
| Actual live deployment | **Not verified by this README or source inspection** | Check workflow execution and the deployed endpoint/account directly; `/api/config` reports its runtime mode/model only if reachable |

## Testing and code quality

**Recorded verification (2026-11-21, commit `4648561`)**:
`npm test` → **112/112 passing in 11 files**; `npm run typecheck` → pass; `npm run lint` → pass;
`npm run build:cloudflare` → pass. This is a dated result for that commit, not a claim that the current
branch or latest CI run has passed.

`npm run build` was not executed in that verification environment because it fetches the Geist font from
Google Fonts. CI is configured to run it, but this README does not assert a current CI result.

### The suite

| File | Tests | Covers |
|---|---:|---|
| `tests/llm.test.ts` | 31 | Prompt shape, citation verification, page correction, unknown documents, contradiction sides, insufficient evidence, provider failures, retries and fallback |
| `tests/analyze-route.test.ts` | 15 | `POST /api/analyze` end to end: demo fallback without a key, 403/400/413, verified and unverified citations, HTTP 429/500, invalid JSON, rejected output, timeout, network failure |
| `tests/workspace.test.ts` | 14 | Demo dataset integrity, workspace loading, case numbering and validation, cascade delete keeping audit history, CSV dedupe, pending-only recommendations, locked reviews, fact replacement |
| `tests/analysis.test.ts` | 12 | Required-document checklist and synonym matching, demo engine output, labelled amounts, contradiction rules |
| `tests/server-config.test.ts` | 8 | Google-key routing, timeout clamping, retry configuration, error messages free of key text, per-visitor rate limiting |
| `tests/misc.test.ts` | 7 | Roles, date normalisation, estimated pagination |
| `tests/workflow.test.ts` | 7 | Analysis → cited facts → pending recommendation → human review → audit trail, through the store rules |
| `tests/extraction.test.ts` | 6 | Real PDF and DOCX extraction through the browser code path, page attribution |
| `tests/accounts.test.ts` | 4 | Demo sign-in, wrong passwords, bcrypt-hashed sign-ups, duplicate and invalid accounts |
| `tests/auth.test.ts` | 4 | bcrypt hashing and salting |
| `tests/csv.test.ts` | 4 | CSV parsing, export quoting, duplicate detection |
| **Total** | **112** | No network, database or API key needed |

### Quality gates

```bash
npm test                  # 112 unit tests
npm run typecheck         # next typegen + tsc --noEmit
npm run lint              # ESLint (next/core-web-vitals)
npm run build             # Next.js production build
npm run build:cloudflare  # Cloudflare Worker build (what is deployed)
```

`.github/workflows/ci.yml` runs all five on every push and pull request on Node 22, with
`NEXT_TELEMETRY_DISABLED=1`.

### Testing the Live AI path without a real key

A mock OpenAI-compatible provider and a 14-scenario runner are included:

```bash
node tests/mock-openai-server.mjs 4010     # terminal 1 — mock provider
cp tests/mock-llm.env.example .env         # point the app at it (gitignored)
npm run dev                                # terminal 2
node tests/e2e-live-ai.mjs                 # terminal 3 — prints PASS/FAIL per scenario
```

The mock is a test double, not a model. Its scenarios cover verified and unverified citations,
contradictions as well as consistent documents, unsupported conclusions, malformed JSON, HTTP 401/429/500,
a transient 503 that recovers on retry, a persistent 503 that exhausts the fallback chain, and a timeout.
Live AI has **not** been validated against a real provider from the development environment; verify it
with your own key before relying on it.

## Security, privacy and responsible AI

### Privacy and data handling

- **Browser-local privacy describes only the current demo.** In Demo Mode, case data is stored in each
  visitor's IndexedDB and is not sent to this app's server. This is not a secure vault: anyone with
  access to the browser profile/device can inspect it, and clearing browser data can erase it.
- **Original files are processed in the browser** (`unpdf`/PDF.js and `mammoth`) and are not uploaded by
  the current demo. Extracted text stays in IndexedDB except for the Live AI flow.
- **Live AI transmits data.** When enabled, the case fields and extracted document text for that analysis
  are sent to `/api/analyze` and then to the configured AI provider. Review the provider's retention and
  privacy terms before sending any data.
- **Privacy will change when server-side persistence returns.** PostgreSQL-backed persistence means
  data will leave individual browsers and be stored server-side for a shared workspace. The exact
  hosting, access controls, tenant isolation, retention/deletion, backups, encryption, incident response
  and provider data-flow policies are not implemented or defined by this repository. Do not use real
  client or sensitive case data until those controls are implemented, reviewed and communicated.
- **API keys stay server-side in the current code.** `src/lib/server-config.ts` is the only current file
  reading `process.env`; provider error bodies are not echoed because they can contain key fragments.
- All data in the public demo dataset (accounts, cases, documents and metrics) is fictional.

### Authentication and access

- Current demo accounts are a **demo convenience**, stored in browser IndexedDB. The current API has
  **no user authentication or server-side authorization**; local role checks are not a security boundary.
- `/api/analyze` has a same-origin request check and, on Cloudflare, a 10-per-minute-per-visitor rate
  limit. These controls do not authenticate users. Any public deployment should be reviewed for access
  controls, abuse limits and provider spending exposure.
- The current audit trail is append-only by application convention (`appendAudit()` only prepends), not
  cryptographically sealed or server-enforced; browser data can be changed or cleared.
- The historical `34dd6c0` implementation did have server-side bcrypt accounts, hashed-token sessions
  in PostgreSQL, authenticated data routes and role checks. Those protections are **not** in the current
  demo. They must be restored and reviewed—not assumed—before the intended production backend is used.

### Responsible AI

- **No final decisions.** Recommendations are advisory, always start `pending`, and are locked only by a
  human action. The system prompt forbids stating legal decisions, orders or conclusions of law.
- **Facts are separated from interpretation.** Quoted facts carry document, page and snippet; reasoning,
  uncertainties and next steps are labelled as generated.
- **Uncertainty is surfaced, not hidden.** Missing information, uncertainties, unverified citations and
  insufficient-evidence flags appear in the recommendation itself.
- **Confidence is not a probability.** It is an uncalibrated heuristic in both modes, and the UI says so.
- **Simulated features are labelled as simulated.** Google Drive, the evaluation figures, the demo
  dataset and the demo accounts are never presented as production functionality.
- **This is a prototype.** It is not legal advice, has not been reviewed by legal professionals for
  production use, and has no measured accuracy results.

## Limitations and future work

### Current demo limitations

| Area | Limitation |
|---|---|
| Persistence | Per browser/device only. No shared workspace or cross-device access; clearing site data resets to demo data; tabs can overwrite each other. |
| Intended production backend | PostgreSQL is absent from the current tree. The historical schema/API are references, not an active service; no Hyperdrive binding, database credentials, deployment or migration exists here. |
| Identity | Browser-local accounts and role checks are not a security boundary. No password reset, organization administration or server-side authorization in the current demo. |
| Live AI | Not validated against a real provider from the development environment; current endpoint has no user authentication. |
| Privacy / retention | Browser-local storage is limited to this demo. Server-side persistence will change data flows and requires explicit tenant, retention, deletion, backup and privacy controls. |
| Extraction | No OCR for scanned/image PDFs and no legacy `.doc`; only PDFs have real page numbers; DOCX/TXT/CSV/MD pages are estimated at ~1,800 characters. |
| Data retention | Original files are not stored. Extracted text remains in browser storage and may be cleared by the visitor. |
| Demo engine | Deterministic heuristics; a fresh analysis can differ from a curated sample recommendation. |
| Audit | Append-only by convention only; not tamper-evident and browser data can be altered or cleared. |
| Evaluation | `/evaluation` metrics are illustrative. No user study or benchmark has been run. |
| Deployment verification | Workflow/config files describe a manual deployment path but do not establish that a live Worker, database or current deployed revision exists. |
| Toolchain | vinext targets Next.js 16 without a full parity guarantee; `@cloudflare/vite-plugin` 2.0 and `cf` are release candidates. |
| Tests | Unit and route tests only. The scripted browser walkthrough is not committed to the repository. |

### Proposed work

| Priority | Item |
|---|---|
| **Production prerequisite** | Restore the verified PostgreSQL/Drizzle schema and authenticated API based on `34dd6c0`; add and review current migrations and a safe schema deployment process. |
| **Production prerequisite** | Integrate PostgreSQL with Cloudflare Workers through a configured Cloudflare Hyperdrive binding; provision infrastructure and secrets outside the repository without committing credentials. |
| **Production prerequisite** | Restore server-side sessions and authorization, then implement tenant isolation, validation, rate limits, secure secret handling, privacy/retention/deletion policy, backups and operational monitoring. |
| **Production prerequisite** | Add integration tests against PostgreSQL and verify deploy health, database connectivity and runtime configuration; do not treat the demo `/api/health` as a database check. |
| Next | Protect Live AI with appropriate access controls and per-organization quotas; document AI-provider data handling. |
| Next | Add OCR (scanned PDFs, photos) and legacy `.doc` support; decide whether originals should be retained, and under what encryption/retention policy. |
| Next | Run the timed caseworker study and extraction benchmark, then replace illustrative evaluation numbers with measured results. |
| Later | Real Google Drive integration (OAuth 2.0 + Drive API) and a CSV column-mapping step. |
| Later | Commit the end-to-end browser walkthrough as Playwright tests in CI. |
| Later | Server-enforced, tamper-evident audit log; content-based document classification; first-class contradiction records across analyses. |

## Project structure

```text
caseclarity-ai/
├── .github/workflows/
│   ├── ci.yml                        # test · typecheck · lint · Next build · Cloudflare build
│   └── deploy-cloudflare.yml         # manual deploy, secret checks, gate on CI checks
├── src/
│   ├── app/
│   │   ├── (app)/                    # signed-in workspace (sidebar shell)
│   │   │   ├── audit/page.tsx        # global audit trail + CSV export
│   │   │   ├── cases/[id]/page.tsx   # case detail: six tabs, upload, analysis, review
│   │   │   ├── cases/new/page.tsx    # create a case
│   │   │   ├── cases/page.tsx        # list, search, filter, export
│   │   │   ├── dashboard/page.tsx    # counts, status chart, review queue
│   │   │   ├── evaluation/page.tsx   # illustrative metrics + live totals
│   │   │   ├── integrations/page.tsx # simulated Drive + real CSV import/export
│   │   │   ├── layout.tsx            # auth gate, navigation, AI-mode badge, reset
│   │   │   └── upload/page.tsx       # multi-file upload with per-file status
│   │   ├── api/analyze/route.ts      # POST — Live AI analysis, verification, rate limit
│   │   ├── api/config/route.ts       # GET  — aiMode and model (non-secret)
│   │   ├── api/health/route.ts       # GET  — liveness
│   │   ├── globals.css               # Tailwind theme tokens
│   │   ├── layout.tsx                # root layout + StoreProvider
│   │   ├── login/page.tsx            # one-click demo accounts
│   │   ├── page.tsx                  # landing page
│   │   └── signup/page.tsx           # local account creation
│   ├── components/ui.tsx             # shared badges, cards, banners, buttons
│   ├── data/demo-data.ts             # the fictional dataset (cases, docs, facts, audit)
│   ├── lib/                          # 12 modules: store, workspace, core, llm, extract, csv…
│   └── types/                        # ambient types for import.meta.env and mammoth
├── tests/                            # 11 Vitest files (112 tests) + mock provider + e2e script
├── cloudflare.config.ts              # Worker name, entrypoint, bindings, rate limit
├── vite.config.ts                    # vinext + Cloudflare plugin
├── vitest.config.ts                  # node environment, "@/" alias
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
├── .env.example                      # optional LLM settings for `npm run dev`
├── .dev.vars.example                 # optional LLM settings for the Worker preview
├── package.json · package-lock.json
├── AGENTS.md · CONTEXT.md · PROBLEM_STATEMENT.md · PROJECT_STATUS.md
└── README.md
```

## Documentation

| Document | What it covers |
|---|---|
| [CONTEXT.md](./CONTEXT.md) | Full project context: feature status, data model, API, pipeline, limitations |
| [PROJECT_STATUS.md](./PROJECT_STATUS.md) | Plain-language summary of what is done and what remains |
| [PROBLEM_STATEMENT.md](./PROBLEM_STATEMENT.md) | The hackathon brief, the problem, the approach and success measures |
| [AGENTS.md](./AGENTS.md) | Working guide for developers and coding assistants: setup, conventions, safe-change rules |

These documents are useful context but were written at different times; where they disagree with the
code, the code is authoritative. For example, some of them still quote older test counts.

## License

**This repository contains no license file.** `package.json` declares no `license` field either, so the
default rules apply: the code is publicly readable, but no permission is granted to copy, modify or
redistribute it. Contact the authors (Team HACKSMITHS) if you want to reuse it.

All demo content — case names, clients, documents, recommendations, audit entries and evaluation
numbers — is fictional. CaseClarity AI is a hackathon prototype: it is not legal advice, must not be used
to make legal decisions, and must not be used with real client data in its current form.

---

<div align="center">

**CaseClarity AI** · Team HACKSMITHS · HACKSMITHS — Build for Campus 2026

*AI reads. People decide. Evidence proves it.*

</div>
