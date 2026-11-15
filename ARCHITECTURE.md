# ARCHITECTURE.md — CaseClarity AI technical reference

> Engineering companion to [`CONTEXT.md`](./CONTEXT.md) (setup, conventions, remaining work) and [`PROBLEM_STATEMENT.md`](./PROBLEM_STATEMENT.md) (product rationale).
> Everything below reflects the current source code. Where behaviour is simulated or incomplete, it says so explicitly.

---

## 1. System overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Browser                                                                      │
│  Public pages (/ , /login, /signup)                                          │
│  Authenticated shell  src/app/(app)/layout.tsx                               │
│      └─ pages: /dashboard /cases /cases/new /cases/[id] /upload              │
│                /integrations /evaluation /audit                              │
│  State: StoreProvider (src/lib/store.tsx) — React state only, no localStorage│
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ fetch, same-origin, httpOnly session cookie
┌───────────────────────────────▼──────────────────────────────────────────────┐
│ Next.js API routes (server-only, Node runtime)                               │
│  requireUser() ─► sessions table ─► users table                              │
│  Drizzle ORM ───► PostgreSQL                                                 │
│  extract.ts ────► unpdf (PDF.js) / mammoth (DOCX)                            │
│  /api/analyze ──► external OpenAI-compatible API (only if LLM_API_KEY set)   │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                     ┌──────────▼───────────┐
                     │ PostgreSQL           │
                     │ users · sessions     │
                     │ cases · documents    │
                     │ extractions          │
                     │ recommendations      │
                     │ audit_logs           │
                     └──────────────────────┘
```

**Trust boundaries**
* The browser is untrusted: it holds no database credentials, no API keys, and no persisted case data.
* The LLM is untrusted: its output is parsed defensively and only accepted in the expected JSON shape; on any failure the client falls back to the local demo engine.
* Uploaded documents are untrusted input: parsed server-side, size-capped, and never executed.

---

## 2. Request lifecycle

### 2.1 Page load (authenticated area)
1. Root layout wraps everything in `StoreProvider` (`src/app/layout.tsx`).
2. On mount, the store calls `GET /api/auth`.
   * `401` → `user = null`.
   * `200` → `user` is set; the store calls `ensureSeed()` (a `GET /api/cases`; if empty, `POST /api/seed`), then `loadAll()`.
3. `loadAll()` issues five parallel requests: `/api/cases`, `/api/documents`, `/api/extractions`, `/api/recommendations`, `/api/audit`.
4. `ready` flips to `true`; `(app)/layout.tsx` renders either the "Sign in required" card or the workspace shell.
5. Pages read from the store; mutations call the API and then update local state (usually from the server's response).

### 2.2 Mutation (example: approve a recommendation)
1. Component calls `updateRec(id, { status: "approved", reviewedBy, reviewComment })`.
2. Store issues `PATCH /api/recommendations/{id}`.
3. Route calls `requireUser()`, filters the body through an allowlist, sets `reviewedAt`, updates the row, returns the row.
4. Store replaces the matching recommendation in state.
5. Component calls `log(caseId, "Recommendation approved", comment, "review")`, which optimistically prepends an audit entry and fires `POST /api/audit`.

---

## 3. Data model

Defined in `src/db/schema.ts` (Drizzle `pg-core`). IDs are UUIDs with `defaultRandom()`; timestamps default to `now()`.

### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default random |
| `email` | text | NOT NULL, UNIQUE |
| `name` | text | NOT NULL |
| `password` | text | NOT NULL — **bcrypt hash**, never plaintext |
| `role` | text | default `case_worker` |
| `created_at` | timestamp | default now |

### `sessions`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `token_hash` | text | NOT NULL, UNIQUE — SHA-256 of the cookie token |
| `expires_at` | timestamp | NOT NULL (now + 7 days) |
| `created_at` | timestamp | default now |

### `cases`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK |
| `case_number` | text | NOT NULL, UNIQUE (`CC-YYYY-NNN`) |
| `title`, `client_name`, `case_type` | text | NOT NULL |
| `status` | text | default `awaiting_review` |
| `priority` | text | default `medium` |
| `description`, `assigned_to` | text | nullable |
| `created_at`, `updated_at` | timestamp | defaults |

> ⚠️ No `completeness` column exists, although the TypeScript model and UI use it. See §13, limitation L1.

### `documents`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `case_id` | uuid | FK → `cases.id` |
| `name`, `type` | text | NOT NULL (e.g. `Lease.pdf`, `PDF`) |
| `size` | integer | bytes, default 0 |
| `status` | text | default `uploaded`; app writes `processed` |
| `extracted_text` | text | pages separated by `\f` (form feed) |
| `source` | text | default `Upload`; Drive imports store `Google Drive (simulated)` |
| `page_count` | integer | default 1 |
| `uploaded_at` | timestamp | default now |

### `extractions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `case_id` | uuid | FK → `cases.id` |
| `document_id` | uuid | FK → `documents.id` — the authoritative source link |
| `field_name`, `field_value` | text | NOT NULL |
| `confidence` | integer | default 80; uncalibrated heuristic |
| `source_doc` | text | filename snapshot |
| `source_page` | integer | 1-based page number |
| `source_snippet` | text | supporting text (±30 chars) |
| `category` | text | `identity` · `date` · `financial` · `fact` |
| `created_at` | timestamp | default now |

### `recommendations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `case_id` | uuid | FK → `cases.id` |
| `title`, `summary`, `reasoning` | text | NOT NULL |
| `confidence` | integer | default 70 |
| `status` | text | `pending` · `approved` · `rejected` · `modified` |
| `evidence` | jsonb | `{ claim, doc, page, snippet }[]` |
| `missing_info`, `uncertainties`, `next_steps` | jsonb | `string[]` |
| `reviewed_by`, `review_comment` | text | nullable |
| `created_at`, `reviewed_at` | timestamp | |

### `audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `case_id` | uuid | FK → `cases.id`, nullable for workspace-level events |
| `actor` | text | NOT NULL (user name or `System (Demo AI)`) |
| `action` | text | NOT NULL (e.g. `Recommendation approved`) |
| `details` | text | free text |
| `category` | text | `case` · `document` · `ai` · `review` · `integration` · `system` |
| `timestamp` | timestamp | default now |

**Relationships:** `users → sessions`, `cases → documents → extractions`, `cases → recommendations`, `cases → audit_logs`. No `ON DELETE CASCADE` is configured, so deleting a case with dependent rows can fail.

---

## 4. API reference

All routes are App Router `route.ts` handlers. Except `/api/health` and the bootstrap case of `/api/seed`, every data route requires a valid session and returns `401 { error: "Unauthorized" }` otherwise.

### 4.1 `GET /api/auth`
Returns `{ user: { id, name, email, role, org } }` or `401`.

### 4.2 `POST /api/auth`
Body: `{ action?: "login" | "signup" | "logout", email, password, name? }`
* `login` (default): ensures the demo user exists, finds the user by lowercased email, compares bcrypt hash. Success → creates a session and sets the cookie. Failure → `401 { error: "Invalid credentials" }`.
* `signup`: `409` if the email exists; otherwise inserts with a bcrypt hash, creates a session, returns `201 { user }`.
* `logout`: deletes the session row and cookie, returns `{ ok: true }`.

### 4.3 `/api/cases`
* `GET` → `{ cases: CaseRow[] }` ordered by `created_at`.
* `POST` — single case: `{ title, clientName, caseType, status?, priority?, description?, assignedTo? }` → `201 { case }`.
* `POST` — bulk import: `{ items: CaseItem[] }` → dedupes by `clientName|title` (case-insensitive) against existing rows **and** within the batch, assigns sequential case numbers, returns `{ added, skipped, cases }`.
* Case number = `CC-2026-` + zero-padded (`max numeric suffix + 1`), starting from base 6 when the table is empty.

### 4.4 `/api/cases/[id]`
* `PATCH` — allowlist: `title`, `clientName`, `caseType`, `status`, `priority`, `description`, `assignedTo`, `completeness`. Always updates `updated_at`. Returns `{ case }` or `404`.
* `DELETE` → `{ ok: true }` (subject to FK constraints).

### 4.5 `/api/documents`
* `GET` (optional `?caseId=`) → `{ documents }` ordered by `uploaded_at`.
* `POST` — `{ caseId, name, type, size?, status?, extractedText?, source?, pageCount? }` → `201 { document }`.

### 4.6 `/api/extractions`
* `GET` (optional `?caseId=`) → `{ extractions }`.
* `POST` — `{ items: Extraction[] }` bulk insert → `201 { extractions }`.
* `DELETE ?caseId=` → deletes all extractions for the case → `{ ok: true }`. Used before re-inserting on re-analysis.

### 4.7 `/api/recommendations`
* `GET` → `{ recommendations }`.
* `POST` — `{ caseId, title, summary, reasoning, confidence?, evidence?, missingInfo?, uncertainties?, nextSteps?, status?, reviewedBy?, reviewComment? }` → `201 { recommendation }`.

### 4.8 `/api/recommendations/[id]`
* `PATCH` — allowlist: `title`, `summary`, `reasoning`, `confidence`, `status`, `evidence`, `missingInfo`, `uncertainties`, `nextSteps`, `reviewedBy`, `reviewComment`. Setting `status` also sets `reviewedAt`. Returns `{ recommendation }` or `404`.

### 4.9 `/api/audit`
* `GET` → `{ audit }` ordered by `timestamp`.
* `POST` — `{ caseId?, actor?, action, details?, category? }`; `actor` defaults to the session user's name → `201 { entry }`.

### 4.10 `POST /api/extract`
* Auth required; `runtime = "nodejs"`.
* Body: `multipart/form-data` with a single `file` field.
* Rejects >10 MB with `413`; missing file with `400`.
* Response: `{ name, text, pageCount, type, warning? }`.
* Supported: `pdf`, `docx`, `txt`, `csv`, `md`. Anything else returns empty text plus a warning naming supported formats.
* Errors → `500 { error: "Extraction failed: …" }`.

### 4.11 `POST /api/analyze`
* Auth required. Body: `{ text: string }`.
* **No `LLM_API_KEY`** → `{ mode: "demo", disclaimer }` (HTTP 200).
* **Key present** → calls `${LLM_BASE_URL || "https://api.openai.com/v1"}/chat/completions` with `{ model: LLM_MODEL || "gpt-4o-mini", temperature: 0.2, response_format: { type: "json_object" }, messages: [system, user] }`, user content truncated to 60,000 characters.
* Success → `{ mode: "llm", model, result }` where `result` is the parsed JSON.
* Provider error → `{ mode: "demo", error }` (HTTP 200) so the client falls back gracefully; invalid JSON throws inside the handler and is likewise surfaced as a demo fallback.

### 4.12 `POST /api/seed`
* If `cases` is empty → seeds and returns `{ seeded: true }`.
* If data exists and `reset` is absent → `{ seeded: false, reason }`.
* `?reset=1` requires authentication; deletes `audit_logs → recommendations → extractions → documents → cases` (children first), re-seeds, and ensures the demo user exists.

### 4.13 `GET /api/health`
Public. Executes `select 1` → `{ ok: true }` or `500 { ok: false }`.

---

## 5. Authentication and security model

### 5.1 Password handling — `src/lib/password.ts`
* `hashPassword(pw)` → `bcrypt.hash(pw, 10)`.
* `verifyPassword(pw, hash)` → `bcrypt.compare`, returning `false` on malformed hashes.
* Plaintext passwords are never logged, persisted, or sent to the client.

### 5.2 Sessions — `src/lib/auth-server.ts`
| Step | Behaviour |
|------|-----------|
| Create | 32 random bytes → raw token to cookie; `sha256(token)` stored in `sessions` with `expiresAt = now + 7d` |
| Cookie | `cc_session`, `httpOnly`, `sameSite=lax`, `path=/`, `secure` when `NODE_ENV=production`, matching expiry |
| Read | Hash the cookie token, join `sessions` → `users`, require `expires_at > now()` |
| Destroy | Delete the session row for the presented token and clear the cookie |
| API guard | `requireUser()` returns the user or `null`; routes translate `null` into `401` |

The raw token never touches the database, so a database leak alone does not yield usable session cookies.

### 5.3 Demo account
`ensureDemoUser()` upserts `demo@caseclarity.ai` with a bcrypt hash of `demo1234` and role `Senior Case Worker`. It is invoked on login attempts. This credential is intentionally public for judging and must be disabled before production use.

### 5.4 Authorization model (important limitation)
The system enforces **authentication only**. There is no `owner_id`/`org_id` on cases, and queries are not scoped per user. Every authenticated account therefore shares one workspace. Adding ownership scoping is the top prerequisite for any multi-tenant deployment. The demo user's `org` (`Northside Legal Aid`) is currently a fixed value returned by `toSessionUser()`.

### 5.5 Additional controls and gaps
* No CSRF token; reliance on `sameSite=lax` plus JSON content types.
* No login rate limiting or lockout.
* No `middleware.ts`; the UI gate is client-side and APIs enforce authorization independently.
* No encryption at rest for extracted text; treat stored data as prototype-only.
* Upload cap: 10 MB per file in `/api/extract`.

---

## 6. Document extraction pipeline

`src/lib/extract.ts` → `extractDocument(buffer, filename)`

| Format | Implementation | Page handling |
|--------|----------------|---------------|
| `.pdf` | `unpdf` → PDF.js, `extractText(uint8, { mergePages: false })` | One string per page; joined with `\f`; `pageCount` from `totalPages` |
| `.docx` | `mammoth.extractRawText({ buffer })` | Single body; `pageCount = max(1, round(chars / 1800))` (estimate) |
| `.txt` / `.csv` / `.md` | UTF-8 decode | Same estimated page count |
| Other | Not parsed | Empty text + explanatory warning |

If a PDF yields no text, a warning is returned noting it may be scanned/image-based. **OCR is not implemented.** DOCX page counts are approximations; only PDFs carry true page numbers.

The `\f` separator is the contract that makes page-level evidence attribution possible. Any change to extraction must preserve it.

---

## 7. Analysis pipeline

### 7.1 Client orchestration — `cases/[id]/page.tsx → runAI()`
1. Logs "AI analysis started".
2. `POST /api/analyze` with concatenated document text.
3. If `mode === "llm"`, maps `result.facts` to `Extraction` rows (resolving `documentId` by matching `sourceDoc` to the case's filenames), creates a `Recommendation`, and logs "AI analysis completed (LLM)".
4. Otherwise falls back to `runAnalysis(c, caseDocs)`, replaces extractions, saves the recommendation, recomputes completeness, and updates case status (`missing_docs` when ≥3 required items are missing, `flagged` when contradictions exist, else `awaiting_review`).

### 7.2 LLM prompt contract — `src/app/api/analyze/route.ts`
The system prompt fixes the response shape:
```json
{
  "facts": [{ "field": "", "value": "", "confidence": 0, "sourceDoc": "", "sourcePage": 1, "snippet": "", "category": "" }],
  "contradictions": [""],
  "missing": [""],
  "recommendation": {
    "title": "", "summary": "", "reasoning": "", "confidence": 0,
    "evidence": [{ "claim": "", "doc": "", "page": 1, "snippet": "" }],
    "missingInfo": [""], "uncertainties": [""], "nextSteps": [""]
  }
}
```
The prompt requires citations for every fact, forbids unsupported claims, and states that confidence is heuristic. **Current limitation:** the handler parses JSON but does not schema-validate every field; the client assumes the documented shape (one reason API/E2E tests are still missing).

### 7.3 Demo engine — `runAnalysis()` in `src/lib/core.ts`
Deterministic and dependency-free:

1. For **each document**, split `extractedText` on `\f` into pages.
2. For **each page**:
   * First capitalized two-word sequence → `Client Name` fact (only the first found across the case).
   * Up to 3 month-name dates (`Month D, YYYY`) → `Date n`.
   * Up to 3 `$` amounts → `Amount n`, also accumulated for contradiction analysis.
   * Every fact records `documentId`, `documentName` (`sourceDoc`), 1-based `sourcePage`, and a normalized ±30-character `sourceSnippet`.
3. Contradictions:
   * Monetary spread: if ≥2 distinct amounts and `max − min > 2000`.
   * Termination conflict: text contains `refilled|position elimination` **and** `accommodation`.
4. Missing documents: `REQUIRED_DOCS[caseType]` entries whose first word appears in neither the filenames nor the full text.
5. Recommendation selection:
   | Condition | Title | Confidence |
   |-----------|-------|-----------|
   | ≥3 missing required docs | Request Missing Documents Before Proceeding | 90 |
   | Contradictions present | Investigate Contradictions Before Filing | 74 |
   | Otherwise | Proceed — Evidence Is Complete and Consistent | 86 |
6. Uncertainties always include the "uncalibrated heuristic, not a verified probability" disclaimer; next steps are derived from the missing list.
7. Evidence = the first four extractions (`claim`, `doc`, `page`, `snippet`).

This engine is intentionally transparent and is labeled **Demo Mode** in the UI and audit trail.

### 7.4 Guarantees
* Re-analysis replaces prior extractions (`DELETE` by `caseId` before insert), preventing duplicate facts.
* Every high-impact output carries a document/page/snippet or an explicit uncertainty.
* The AI never writes a case to `completed`; only a human action does (and see limitation L4).

---

## 8. Evidence and confidence model

* **Facts** are document claims, displayed with document, page, and snippet; they are not independently verified truth.
* **Confidence** is a 0–100 heuristic used for triage. `ConfidenceBar` maps `≥85` high, `≥70` moderate, else low. The UI states repeatedly that it is uncalibrated and must not be read as a probability of correctness or legal success.
* **Uncertainties** and **missing information** are first-class fields on every recommendation and are rendered next to the evidence.
* **Human decision boundary:** approvals/modifications/rejections are recorded with reviewer identity, comment, and timestamp.

---

## 9. CSV pipeline

### Import — `src/lib/csv.ts`
1. `parseCasesCSV(text)` → PapaParse with `header: true`, `skipEmptyLines: true`, headers lowercased/trimmed → `{ headers, rows, errors }`. Handles quoted commas, embedded newlines, CRLF.
2. `buildCasesFromRows(rows)`:
   * Client from `client_name|client|name`; title from `title|case_title|case`; type from `case_type|type|category`; date from `date|created|created_at`.
   * Missing client/title → default values plus warnings.
   * Records observed date formats (`YYYY-MM-DD`, `MM/DD/YYYY`, `other`) to flag mixed input.
3. `await importCases(items)` → `POST /api/cases` with `{ items }`.
4. Server `dedupeCases(items, existing)` compares `clientName|title` (case-insensitive) against the DB **and** within the batch; returns `{ added, skipped }`.
5. UI renders rows read / added / duplicates skipped plus warnings.

CSV statuses imported from external systems are stored as-is and are **not** validated as legal or AI decisions.

### Export
Client-generated CSV built in `cases/page.tsx` and `integrations/page.tsx` with manual quote doubling. Limitations: not PapaParse-generated, no formula-injection prefix escaping, no server endpoint.

### Sample CSV
`integrations/page.tsx` generates a demo file containing a deliberate duplicate row.

---

## 10. Integrations

| Integration | Status | Mechanism |
|-------------|--------|-----------|
| CSV case management | ✅ Functional | PapaParse import + server dedupe; client export |
| Google Drive | ⚠️ **Simulated** | Fixed `DRIVE_FILES` list; "Import" calls `addDoc()` with `source: "Google Drive (simulated)"` and placeholder text, attached to `cases[0]`; audit-logged; UI badge "Simulated" and copy stating no live connection exists |
| Email / e-filing / court systems | ❌ Not implemented | — |

No OAuth flow, token storage, or Drive API call exists in the codebase.

---

## 11. Audit model

* Written by `log()` in the store: optimistic local prepend + `POST /api/audit` (fire-and-forget; failures are not surfaced).
* Categories drive iconography and filtering: `case`, `document`, `ai`, `review`, `integration`, `system`.
* Recorded events include case creation, uploads (with page/character counts), analysis start/completion (with mode and confidence disclaimer), contradiction detection, recommendation generation, approvals/rejections/modifications, document requests, flags, CSV import/export, and demo resets.
* Per-case timeline available in the case Audit tab; workspace-wide list at `/audit`.
* Not cryptographically signed or tamper-evident; entries can be deleted with the case only if FK constraints allow.

---

## 12. Frontend architecture

* **Route groups:** public pages at `src/app/{page,login,signup}`, authenticated pages under `src/app/(app)/…` sharing a layout with sidebar/topbar/toasts.
* **Store** (`src/lib/store.tsx`): one provider above everything; exposes `user`, `ready`, `cases`, `docs`, `extractions`, `recs`, `audit`, mutation methods, `notify`/`toast`. Session restore happens once on mount.
* **Component library** (`src/components/ui.tsx`): `Logo`, `Badge`, `StatusBadge`, `ConfidenceBar`, `DemoBanner`, `SafetyBanner`, `EmptyState`, `Card`, `Btn`, `Field`, `inputCls`, `PriorityDot`, `DocIcon`.
* **Styling:** Tailwind CSS v4 with `@theme` tokens in `src/app/globals.css` (navy `#0f2043`, `#1e3a5f`, soft blues, canvas `#f6f8fb`), `rounded-2xl` cards, `animate-fadeUp`, `scrollbar-thin`.
* **Responsive:** mobile drawer with overlay, sticky topbar, grid breakpoints (`sm`, `lg`, `xl`), horizontally scrollable tables.
* **Feedback:** in-app toast (`role="status"`), inline error messages, loading states; no native `alert()` (blocked in some sandboxes).
* **Accessibility basics:** semantic headings, labelled inputs, visible focus styles from Tailwind, `role`/`title` attributes on icon-only controls. A formal audit has not been performed.

---

## 13. Configuration and deployment

| File | Purpose |
|------|---------|
| `.env` / `.env.local` | Runtime environment (never commit secrets) |
| `.env.example` | Documented variable names |
| `drizzle.config.json` | Drizzle Kit schema path + connection URL (currently hardcoded to the local dev database) |
| `next.config.ts` | Default Next config (no custom headers/rewrites) |
| `tsconfig.json` | Strict TS, `@/*` alias, excludes `tests/` and `vitest.config.ts` from Next type-checking |
| `vitest.config.ts` | Node environment, `tests/**/*.test.ts`, 30 s timeout |

**Deployment checklist**
1. Provision PostgreSQL and set `DATABASE_URL`.
2. `npx drizzle-kit push` (and update `drizzle.config.json` or use environment-driven config).
3. Optionally set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.
4. `npm run build` → `npm run start` behind HTTPS (so `secure` cookies apply).
5. Verify `GET /api/health` returns `{ ok: true }`.
6. Remove or gate the prefilled demo credentials and the public bootstrap seed for any real environment.

---

## 14. Testing

Current automated coverage (`npx vitest run` → 3 files, 14 tests, passing):

| File | What it proves |
|------|----------------|
| `tests/extraction.test.ts` | Real PDF buffer → text and `pageCount`; real DOCX (built with JSZip) → text; TXT → text; facts attributed to the correct `documentId`/filename; page attribution using `\f`; evidence entries include document, page, snippet |
| `tests/auth.test.ts` | Hash ≠ plaintext, bcrypt prefix, correct/incorrect password verification, salted hashes differ |
| `tests/csv.test.ts` | Quoted commas, mixed date formats, missing columns/defaults, duplicate detection both within a batch and against existing rows |

**Not covered yet:** API route behaviour, database transactions, session lifecycle over HTTP, LLM response validation, React components, and end-to-end browser flows. `npm run typecheck`, `npx next typegen`, and `npm run build` are the current static gates.

---

## 15. Security posture

| Control | Status |
|---------|--------|
| Password hashing (bcrypt, cost 10) | ✅ |
| Session tokens hashed at rest; httpOnly cookie | ✅ |
| API authentication on all data routes | ✅ |
| Input allowlists on PATCH routes | ✅ |
| Upload size cap (10 MB) | ✅ |
| Server-side parsing only | ✅ |
| No credentials/case data in browser storage | ✅ |
| Per-user data isolation | ❌ Shared workspace |
| CSRF tokens | ❌ (relies on SameSite=Lax) |
| Rate limiting / lockout | ❌ |
| Encryption at rest | ❌ |
| Public demo credentials | ⚠️ Intentional, must be removed pre-production |
| Unauthenticated seed when DB empty | ⚠️ Bootstrap convenience |

**Threat model summary:** the prototype assumes a trusted, small operator team and fictional data. It is not ready for real client records, regulatory compliance, or hostile multi-tenant use.

---

## 16. Decision log

| Decision | Rationale | Consequence |
|----------|-----------|-------------|
| Next.js API routes instead of a separate backend | One deployable, shared types, fast iteration for a hackathon | No independent scaling; LLM and parsing share the app runtime |
| Drizzle ORM + PostgreSQL | Typed schema and SQL transparency; easy local bootstrap | Unknown keys are silently ignored — schema and TS model can drift (see L1) |
| Server-side extraction with `\f` page separator | Enables true page-level citations for PDFs without storing binaries | Only PDFs have accurate pages; DOCX/TXT page counts are estimates |
| Dual analysis engines with demo fallback | Product must be demonstrable without paid API keys; judges can always complete the flow | Demo quality is rule-based and clearly labeled |
| bcrypt + hashed session tokens | Eliminates plaintext credentials and DB-leaked usable sessions | No refresh-token rotation, no account lockout yet |
| Authentication-only authorization | Simplifies the judged demo to one shared workspace | Not multi-tenant; must be extended before real use |
| Optimistic audit logging from the client | Immediate UI feedback, simple code | Failed writes are swallowed; server-side logging would be more reliable |
| Simulated Drive with explicit labels | Avoids pretending an OAuth integration exists | Import is illustrative and targets the first case |
| Illustrative evaluation metrics | Honest about absence of a real study | Page proves the measurement design, not product performance |

---

## 17. Extension playbooks

### Add a new required-document rule
1. Edit `REQUIRED_DOCS` in `src/lib/core.ts`.
2. Confirm the case page checklist and `runAnalysis` missing-item logic both read from it (they do by case type).
3. Improve matching if needed — current logic compares the first word only.

### Add a new extracted field
1. Add the rule inside the per-page loop in `runAnalysis`, always passing `documentId`, `d.sourceDoc`, `page`, and `sourceSnippet`.
2. Mirror it in the LLM prompt contract if it should also come from the model.
3. Add an assertion to `tests/extraction.test.ts`.

### Persist a new field end-to-end
1. Add the column in `src/db/schema.ts`; run `npx drizzle-kit push`.
2. Add it to the domain type in `src/lib/core.ts`.
3. Include it in the relevant API allowlist (`PATCH`) and/or insert body.
4. Verify with a GET after PATCH — Drizzle ignores unknown keys, so verify persistence, not just types.

### Add a new review action
1. Extend the review UI in `cases/[id]/page.tsx` and the `status` union in `core.ts` if new.
2. Update the recommendation through `updateRec` and write an audit entry with category `review`.
3. Decide explicitly whether the **case** status must change (today approvals do not).

### Enable live LLM analysis
1. Set `LLM_API_KEY` (and optionally `LLM_BASE_URL`, `LLM_MODEL`) in the server environment.
2. Confirm `/api/analyze` returns `mode: "llm"`.
3. Harden validation of the returned JSON shape before trusting it in the UI.
4. Verify the fallback still works when the provider times out.

### Harden for real deployment (recommended order)
1. Add `owner_id`/`org_id` to cases and scope every query; add authorization tests.
2. Add the missing `completeness` column (or remove it from the UI contract).
3. Add CSRF protection, rate limiting, and account lockout.
4. Add `ON DELETE CASCADE` or soft deletes; move audit writes server-side.
5. Remove demo credentials and gate the bootstrap seed.
6. Add API/route and Playwright end-to-end tests; add OCR for scanned PDFs.

---

## 18. Limitations register (quick reference)

| ID | Limitation | Evidence in code |
|----|------------|------------------|
| L1 | `completeness` is not a DB column; updates are silently discarded | `src/db/schema.ts` (no column), `api/cases/[id]/route.ts` allowlist, Drizzle `buildUpdateSet` iterates table columns |
| L2 | LLM key name mismatch prevents live mode | `.env.example` documents `LLM_API_KEY`; `.env.local` currently provides `OPENAI_API_KEY`; route reads `LLM_API_KEY` |
| L3 | Single shared workspace (no per-user scoping) | No owner column; GET handlers select all rows |
| L4 | Approving a recommendation doesn't change case status | `review()` in `cases/[id]/page.tsx` calls `updateRec`/`log` only |
| L5 | Evaluation totals hardcoded; metrics static | `evaluation/page.tsx` constants and `EVALUATION` in `core.ts` |
| L6 | CSV export hand-rolled, no formula-injection guard | `cases/page.tsx`, `integrations/page.tsx` |
| L7 | Drive import simulated, targets first case | `integrations/page.tsx`, `DRIVE_FILES` |
| L8 | No OCR; scanned PDFs yield little text | `extract.ts` warning only |
| L9 | Original binaries not stored | `/api/documents` persists `extractedText` only |
| L10 | Required-doc matching is first-word heuristic | `cases/[id]/page.tsx`, `runAnalysis` |
| L11 | Audit writes optimistic and fire-and-forget | `log()` in `store.tsx` |
| L12 | Hardcoded sidebar count (`6`) and bell badge (`3`) | `(app)/layout.tsx` |
| L13 | No API/E2E tests | `tests/` contains library tests only |
| L14 | No CSRF/rate limiting/middleware; no encryption at rest | Absence across `src/app/api/*`, no `middleware.ts` |
