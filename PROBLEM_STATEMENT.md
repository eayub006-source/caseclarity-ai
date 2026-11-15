# CaseClarity AI — Problem Statement

> **Project:** CaseClarity AI · **Team:** HACKSMITHS · **Event:** Build for Campus 2026
> **One-line description:** An explainable, human-in-the-loop case workspace that turns long, inconsistent legal-aid documents into source-cited facts and reviewable recommendations — never final legal decisions.

---

## 1. Original problem statement

Small legal-aid nonprofits handle long, inconsistent, and incomplete client documents with very limited staff time. Existing AI tools tend to produce confident-sounding conclusions without explaining *why*, without citing evidence, and without making it clear what they do **not** know. Case workers therefore cannot safely rely on them, and there is no defensible record of how a decision was reached.

The platform must:

1. Help case workers process and understand documents faster.
2. Show **why** every AI recommendation was produced.
3. Cite the exact source document and page for every extracted fact.
4. Make missing information, contradictions, and uncertainty visible.
5. Never make final legal decisions — a human always reviews and decides.
6. Keep a complete, timestamped audit trail of documents, AI output, evidence, and human actions.
7. Integrate with real-world systems that do not have clean APIs (CSV case systems, file storage).
8. Be honest when something is simulated or illustrative.

---

## 2. The problem in depth

| # | Problem | Who feels it | Consequence today |
|---|---------|--------------|-------------------|
| P1 | **Document overload** | Case workers, interns | Hours spent reading leases, denial letters, pay stubs, and correspondence to reconstruct one timeline. |
| P2 | **Inconsistent information** | Case workers, supervising attorneys | Salary, income, or date figures differ between documents; discrepancies are found late or missed entirely. |
| P3 | **Incomplete files** | Case workers | Appeals are filed — or decisions drafted — before required documents exist, risking denial or delay. |
| P4 | **Opaque AI** | Case workers, clients, auditors | Generic LLM output gives answers without traceable evidence, so it cannot be checked or defended. |
| P5 | **No accountability record** | Supervisors, auditors | No reliable history of what the AI suggested, what evidence existed, and who changed what. |
| P6 | **Messy integrations** | Operations staff | Case data lives in spreadsheets with inconsistent column names, mixed date formats, duplicates, and blank rows. |
| P7 | **Overclaiming AI performance** | Everyone | Vendor benchmarks are presented as proven outcomes even when no evaluation has been run. |
| P8 | **Confidentiality** | Organization, clients | Client documents must not leak into browser storage, logs, or third-party systems without control. |

The core tension: **AI can save time, but only if a case worker can verify it.** Speed without traceability is a liability in legal aid.

---

## 3. Who we are building for

| Persona | Primary need |
|---------|--------------|
| **Legal-aid case worker** (primary) | Understand a messy case file quickly, know what is missing, and decide the next procedural step with cited evidence. |
| **Supervising attorney** | Review a subordinate's decision together with the evidence and reasoning behind it. |
| **Intake / operations staff** | Move data in and out of existing spreadsheets without silent data loss. |
| **Client** (indirect) | Faster, more consistent assistance; no automated eligibility denial. |
| **Judge / hackathon evaluator** | A working, inspectable prototype with honest labeling of what is real and what is simulated. |

---

## 4. What we are building

**CaseClarity AI** is a full-stack web application for explainable legal-aid case management. It is an **assistive** system: every recommendation is advisory, source-linked, and must be approved, modified, or rejected by a human.

### Product principles

1. **Evidence before conclusion** — a recommendation without a citation is not presented as usable.
2. **Humans decide** — no eligibility determination, no legal advice, no automatic approval.
3. **Uncertainty is a feature** — missing documents, contradictions, and limitations are surfaced next to the recommendation.
4. **Traceability by default** — documents, analyses, evidence, and reviewer actions are recorded.
5. **Honest labeling** — simulated integrations and demo-mode analysis are labeled as such everywhere they appear.
6. **Least data retention** — extracted text is stored server-side in PostgreSQL; credentials are hashed and never stored in the browser.

---

## 5. Proposed solution

| Problem | Our solution | Where it lives |
|---------|--------------|----------------|
| P1 Document overload | Real server-side text extraction for PDF/DOCX/TXT plus a structured case workspace with per-case document lists | `/upload`, `/cases/[id]` → Documents |
| P2 Inconsistent information | Contradiction detection across documents (e.g. conflicting monetary figures, "position eliminated" vs. "position refilled") | Analysis + Recommendation tabs |
| P3 Incomplete files | Required-document checklists per case type with a visible missing-items list | Case Overview checklist, Analysis tab, Recommendation tab |
| P4 Opaque AI | Every extracted fact stores `documentId`, filename, page number, and a supporting snippet; recommendations carry a `reasoning`, `evidence[]`, `uncertainties[]`, and `nextSteps[]` | `/cases/[id]` tabs + `extractions` / `recommendations` tables |
| P5 No accountability record | Append-only audit entries for case creation, uploads, analysis, contradiction detection, and human review actions, with an audit page and per-case timeline | `/audit`, `audit_logs` |
| P6 Messy integrations | Standard-compliant CSV import (RFC 4180) with duplicate detection, column-alias handling, date-format detection, and a visible import report; CSV export | `/integrations` |
| P7 Overclaiming | Evaluation page explicitly labels all figures as illustrative and explains how to replace them with real measurements | `/evaluation` |
| P8 Confidentiality | bcrypt password hashing, hashed session tokens in an httpOnly cookie, all data access through authenticated API routes, no credentials or case data in localStorage | `/login`, `/signup`, `src/lib/auth-server.ts` |

---

## 6. Our approach

### 6.1 End-to-end workflow

```
Upload documents  →  Extract text (real PDF.js / mammoth)
                  →  Extract facts (document + page + snippet)
                  →  Detect contradictions and missing items
                  →  Generate an explainable recommendation
                  →  Human approves / modifies / rejects
                  →  Everything is written to the audit trail
```

### 6.2 Two analysis paths, one contract

* **LLM path** — `/api/analyze` calls an OpenAI-compatible chat-completions API server-side when `LLM_API_KEY` is configured. The model is instructed to return structured JSON with citations; the key never reaches the browser.
* **Demo path** — if no key is configured (or the call fails), a deterministic local engine (`runAnalysis` in `src/lib/core.ts`) extracts facts **per document and per page**, detects contradictions and missing documents, and produces a recommendation. This path is labeled **Demo Mode** in the UI and in the audit trail.

Both paths produce the same data shape, so the review and audit workflow is identical.

### 6.3 Architecture in one paragraph

A Next.js App Router frontend (React 19 + Tailwind CSS v4) talks exclusively to authenticated API routes. Those routes use Drizzle ORM to read and write PostgreSQL. Document parsing happens on the server (`unpdf`/PDF.js for PDF, `mammoth` for DOCX). Authentication uses bcrypt password hashes plus server-side sessions whose tokens are stored only as SHA-256 hashes. A shared client store (`src/lib/store.tsx`) holds the fetched workspace state so every page reads from one source of truth. See `ARCHITECTURE.md` for details and `CONTEXT.md` for setup and conventions.

---

## 7. Key features

### Authentication and access
* Email/password sign-up and sign-in; passwords stored as bcrypt hashes.
* Server-side sessions with hashed tokens in an httpOnly cookie (7-day expiry).
* Every data API returns `401` without a valid session.
* Judge-friendly demo account: `demo@caseclarity.ai` / `demo1234`.

### Case management
* Dashboard with totals, status distribution, pending recommendations, recent cases, and recent activity.
* Case list with text search and status/type filters; CSV export.
* Case creation with type, priority, description, and automatic case number (`CC-YYYY-NNN`).

### Documents
* Drag-and-drop upload of **PDF, DOCX, TXT, CSV, MD** (10 MB limit per file).
* Real extractive parsing on the server; each page stored separately so citations can reference page numbers.
* Documents tab with status, page count, extracted-text preview, and a download of the extracted text.

### Explainable analysis
* Structured extraction of names, dates, and monetary amounts with **document ID, filename, page number, and snippet**.
* Contradiction detection (monetary spread, termination/re-fill inconsistency).
* Required-document checklist per case type; missing items are listed explicitly.
* Recommendation with title, summary, reasoning, confidence, evidence array, missing information, uncertainties, and next steps.

### Human review
* Approve, modify (with edited text), or reject a recommendation; optional reviewer comment.
* "Request documents" and "Flag for investigation" actions.
* Review tab and full case audit timeline; all actions are audit-logged with actor and timestamp.

### Integrations
* **CSV import** (functional): PapaParse-based RFC 4180 parsing, quoted fields, embedded commas/newlines, column aliases, mixed date detection, missing-column and incomplete-row warnings, duplicate skipping, and a row-level import report.
* **CSV export** (functional): case list export from the Cases and Integrations pages.
* **Google Drive import** (clearly labeled **Simulated**): browses a fixed fictional file list and attaches a placeholder document; no OAuth or Drive API is used.

### Evaluation
* Comparison of manual vs. AI-assisted review time, extraction accuracy, missing-information detection, and evidence coverage.
* All figures are visibly labeled as illustrative demo measurements with guidance on replacing them with a real timed study and annotations.

### Safety and transparency
* Persistent "Demo Mode" and "Human-in-the-loop" banners.
* Confidence values are explicitly described as **uncalibrated heuristics**, not probabilities.
* Written safety section on the landing page covering the human-decision boundary and data limits.

---

## 8. How the system works (walkthrough)

1. **Sign in.** The browser posts credentials to `POST /api/auth`; the server compares a bcrypt hash, creates a session row (token hash + expiry), and sets an httpOnly cookie.
2. **Workspace loads.** `StoreProvider` calls `GET /api/auth` to restore the session, then loads cases, documents, extractions, recommendations, and audit entries from the authenticated API routes. If the database has no cases, `POST /api/seed` loads the fictional demo dataset (6 cases, 15 documents, 20 facts, 6 recommendations, 14 audit events).
3. **Upload.** The client posts the file to `POST /api/extract`. The server detects the format, extracts text per page (joined with `\f`), and returns `{ text, pageCount, type, warning? }`. The client saves the document through `POST /api/documents`.
4. **Analyze.** The client posts combined document text to `POST /api/analyze` with `{ text }`. With an API key the server calls the LLM and returns structured JSON (`mode: "llm"`); otherwise it returns `mode: "demo"`. On demo mode or failure, the client runs `runAnalysis` locally. Facts are attributed to the document and page they came from, saved via `DELETE`+`POST /api/extractions`, and the recommendation is saved via `POST /api/recommendations`.
5. **Review.** The reviewer approves, modifies, or rejects through `PATCH /api/recommendations/[id]`; the action and reasoning are written with `POST /api/audit`.
6. **Audit.** `/audit` lists every recorded event; `/cases/[id] → Audit` shows the per-case timeline, and the Review tab filters the human-review subset.

---

## 9. Scope

### Implemented and working
Authentication (hash + session), PostgreSQL persistence, real PDF/DOCX/TXT extraction, per-document/per-page evidence attribution, two analysis paths with automatic fallback, explainable recommendations, missing-document checklists, contradiction detection, human review actions, audit trail, CSV import/export, simulated Drive import, evaluation page, automated tests for extraction, attribution, auth hashing, and CSV parsing.

### Explicitly simulated or illustrative
* **Google Drive** — no OAuth, no Drive API; fixed fictional file list, labeled "Simulated".
* **LLM analysis** — code path is real, but the deployment runs in Demo Mode unless `LLM_API_KEY` is set.
* **Confidence scores** — uncalibrated heuristics.
* **Evaluation metrics** — placeholders, not measured results.
* **Original file storage** — only extracted text is persisted, not the uploaded binary.

### Out of scope for this prototype
Real OAuth for cloud storage, OCR for scanned documents, electronic court filing, full multi-tenant row-level isolation, e-signature, payments, and production compliance certification (HIPAA/legal-hold/retention policies).

---

## 10. Success criteria and evaluation plan

### Product success
* A new user can go from upload to a human-recorded decision without leaving the app.
* Every fact displayed in the UI is traceable to a specific document, page, and snippet.
* Every recommendation exposes reasoning, evidence, missing information, and uncertainties.
* No workflow allows the AI to set a final case outcome without a human action.

### Measured evaluation (planned)
The `/evaluation` page defines the intended study:
1. **Timed user study** — 5–10 case workers review the same fictional cases manually and with AI assistance; record time per case.
2. **Extraction benchmark** — score extracted fields against a gold-standard annotation; report precision/recall per field type.
3. **Evidence coverage audit** — reviewers rate whether each recommendation claim has adequate citation; report percentage and inter-rater agreement.

Until such a study is run, the numbers on that page must remain labeled illustrative.

---

## 11. Non-negotiables

1. The system never makes a final legal or eligibility decision.
2. High-impact output always carries source evidence.
3. Uncertainty and missing information are never hidden to make a recommendation look stronger.
4. A human can always override, and the override is recorded.
5. Simulated or unmeasured capabilities are labeled as such in the product, not only in documentation.
6. Use fictional or de-identified data in the demo; do not treat this prototype as a compliant document vault.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Users over-trust AI confidence | Qualitative "Low/Moderate/High" framing, explicit "uncalibrated heuristic" copy, demo-mode banners. |
| Extraction misses scanned or handwritten content | Surface a warning when extracted text is empty or short; document that OCR is not implemented; keep human verification mandatory. |
| Hallucinated citations in LLM mode | Structured JSON contract, server-side validation of returned shape, human review, and demo fallback. |
| Sensitive client data exposure | Password hashing, hashed session tokens, httpOnly cookie, no browser-persisted credentials; documented limitation that storage is not encrypted at rest in this prototype. |
| Overstating hackathon results | All performance numbers clearly marked illustrative; methodology section explains how to replace them. |
| Integrations appear "live" when they are not | Drive card and Demo Mode banner state simulation; CSV is genuinely functional and labeled "Live". |
