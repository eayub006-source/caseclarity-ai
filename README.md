# CaseClarity AI

**Understand Every AI Decision. Trust Every Case.**

Explainable AI-powered legal case management for small legal-aid nonprofits. Built by **Team HACKSMITHS** for **Build for Campus 2026**.

CaseClarity AI assists human case workers — it never makes final legal decisions. Every recommendation shows why it was generated, the supporting evidence with document and page citations, a confidence indicator (an uncalibrated heuristic, not a verified probability), missing information, uncertainties, and suggested next steps. Every human action is recorded in an auditable audit trail.

## The core workflow

`Upload documents → Extract information → Analyze documents → Generate explainable recommendation → Display supporting evidence and uncertainty → Human review → Save decision in audit trail`

## Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API routes (TypeScript)
- **Database:** PostgreSQL via Drizzle ORM
- **Document extraction:** PDF.js (via `unpdf`) for PDF, `mammoth` for DOCX — real parsing, per-page
- **AI:** OpenAI-compatible chat completions API (server-side only) with a transparent, deterministic demo engine fallback
- **Auth:** bcrypt password hashing + server-side sessions (httpOnly cookie, SHA-256 token hashes)
- **CSV:** PapaParse (RFC 4180)

## Getting started

```bash
npm install
cp .env.example .env      # then set DATABASE_URL (and optionally LLM_API_KEY)
npx drizzle-kit push      # create tables
npm run dev               # or: npm run build && npm start
```

**Demo account:** `demo@caseclarity.ai` / `demo1234`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `LLM_API_KEY` | no | Enables real LLM analysis; without it the app runs in clearly-labeled Demo Mode |
| `LLM_BASE_URL` | no | OpenAI-compatible API base (default `https://api.openai.com/v1`) |
| `LLM_MODEL` | no | Model name (default `gpt-4o-mini`) |

## Tests

```bash
npx vitest run
```

Covers real PDF/DOCX/TXT extraction, per-document and per-page evidence attribution, password hashing, and CSV import (quoted fields, mixed dates, missing columns, dedupe).

## What is simulated (honest list)

- **Google Drive import** — labeled *Simulated* in the UI; no OAuth/Drive API.
- **LLM analysis** — the code path is real, but without `LLM_API_KEY` the app runs in Demo Mode with a deterministic local engine.
- **Confidence scores** — uncalibrated heuristics, never presented as verified probabilities.
- **Evaluation metrics** — illustrative demo measurements, labeled as such.

All demo data is fictional.

## License

MIT
