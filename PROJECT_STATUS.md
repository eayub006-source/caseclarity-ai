# Project Status — CaseClarity AI

> A plain-language summary of **what is done** and **what is remaining**.
> Last updated: **21 November 2026** · Branch: `main`
>
> For technical details see [CONTEXT.md](./CONTEXT.md) (full inventory) and [AGENTS.md](./AGENTS.md) (how to work on the code).

---

## 1. What we are building (in one minute)

CaseClarity AI helps **legal-aid workers** handle client cases faster.

1. The worker uploads the client's documents (lease, letters, pay slips…).
2. The AI reads them and finds **facts**, **conflicts** and **missing documents** — and shows *which file and page* each fact came from.
3. The AI suggests a **next step** with its reasons.
4. A **human approves, edits or rejects** it. The AI never decides alone.
5. Every action is saved in an **audit trail** (who did what, and when).

---

## 2. How this version works (important)

This is the **demo build**, made to be easy to host on **Cloudflare**:

- **No database.** The fictional demo data is a file inside the project: `src/data/demo-data.ts`.
- **Each visitor gets their own copy**, saved in their own browser. Changes (new cases, uploads, reviews) stay after a reload, and judges never see each other's changes.
- **Reset demo data** (sidebar, senior case workers) puts everything back to the original.
- **Documents never leave the computer** — the text is read inside the browser.
- The earlier version with a **PostgreSQL** database and server logins is saved in git history (commit `34dd6c0`) if a shared workspace is needed later.

**Logins** (one click on the sign-in page, password `demo1234`):

| Account | Role | Can do |
|---|---|---|
| `demo@caseclarity.ai` — Alex Rivera | Senior Case Worker | Everything, including delete cases and reset demo data |
| `caseworker@caseclarity.ai` — Jordan Lee | Case Worker | Everything except delete cases and reset demo data |

New accounts can be created on the sign-up page; they are saved in that browser only.

---

## 3. Quick summary

| Area | Status |
|---|---|
| Sign in, sign up, roles, one-click demo accounts | ✅ Done (accounts live in the browser) |
| Cases (create, list, search, filter, delete) | ✅ Done |
| File upload + text extraction (PDF, DOCX, TXT, CSV, MD) | ✅ Done — in the browser |
| Required-documents checklist + completeness % | ✅ Done |
| AI analysis — demo engine (no API key) | ✅ Done |
| AI analysis — real LLM (with API key) | 🟡 Built and verified against a mock provider (12-scenario run); not yet run with a real key |
| Explainable recommendation (evidence, conflicts, missing info, next steps) | ✅ Done |
| Human review (approve / modify / reject, locked after decision) | ✅ Done |
| Audit trail (search, export) | ✅ Done |
| CSV import / export | ✅ Done |
| Google Drive import | 🟡 Simulated only |
| Saving data | 🟡 Per browser — no shared workspace |
| Cloudflare deployment | ✅ Ready — `npm run deploy` (needs your Cloudflare login) |
| Automated tests | ✅ 85 unit tests, run on every push (GitHub Actions) |
| Browser walkthrough (desktop + phone) | ✅ Done 21 Nov 2026 on the normal and the Cloudflare build |
| OCR for scanned PDFs | ❌ Not started |
| Shared workspace / organizations / password reset | ❌ Not in this build |
| Real evaluation results | ❌ Not started |

---

## 4. What is DONE ✅

### 4.1 Accounts and roles
- One-click demo accounts for both roles; sign up, sign in, sign out.
- New accounts' passwords are stored only as a **bcrypt hash**, never as plain text. Passwords need at least 8 characters.
- Case workers cannot delete cases or reset demo data.
- Honest note: because everything lives in the browser, accounts show *who did what* — they do not lock data away from someone using the same browser.

### 4.2 Dashboard and cases
- Live counts, cases-by-status chart, "needs your review" list, recent cases and activity; the bell shows how many recommendations wait for review.
- Create, list, search, filter and delete cases. Case numbers like `CC-2026-007` are assigned automatically.
- Each case page has tabs: **Overview, Documents, Analysis, Recommendation, Human Review, Audit**.

### 4.3 Documents
- Drag-and-drop or click to upload **PDF, DOCX, TXT, CSV, MD** (max 10 MB each).
- Text is extracted **in the browser** — PDFs with real page numbers, other types with estimated pages.
- Required-documents checklist per case type; it recognises similar names (e.g. `Pay_Stubs.pdf` counts as "Proof of Income").

### 4.4 AI analysis
- **Demo engine** (no key): finds names, labelled dates and money amounts, conflicts between similar figures, and missing documents; suggests the next step.
- **Real AI** (with `LLM_API_KEY`): any OpenAI-compatible API. Every quote the AI gives — facts, evidence and both sides of a contradiction — is checked against the documents; anything it cannot find is marked **"Unverified"**, and a contradiction that cannot cite two traceable sides is dropped. The AI must say when the documents do not support a conclusion. If the call fails, the demo engine takes over and the app says why.
- Labels are honest everywhere: "Live AI" or "Demo Mode", and each recommendation says which engine made it.

### 4.5 Human review and audit trail
- Approve / Modify / Reject with a comment; approved or rejected recommendations are locked.
- Every upload, analysis, review, import, export, delete and reset is logged with the person and the time.

### 4.6 Integrations
- CSV import with a report (duplicates, bad dates, missing columns); CSV export of cases and the audit trail.
- Google Drive: simulated and clearly labelled.

### 4.7 Cloudflare and quality
- Builds for **Cloudflare Workers** (via vinext). The server part is tiny (about 380 KB) and stores nothing.
- Tested in Cloudflare's own runtime on this computer: every page and flow works, including the real-AI path with a fake AI server.
- 56 automated tests; typecheck, lint and both builds pass; CI runs them on every push.
- Security fixes: Next.js 16.4.6; production packages have **0 known vulnerabilities**.

---

## 5. What is REMAINING

### 🔴 To finish the demo
| # | Task | Why it matters |
|---|---|---|
| 1 | **Deploy to Cloudflare:** `npx cf auth login`, then `npm run deploy` | Needs your Cloudflare account — it prints the public link |
| 2 | **Optional: test the real AI with a real API key** | Verified against the included mock provider (12 scenarios). Point `.env` at a real provider and re-run `node tests/e2e-live-ai.mjs`. See README → "Deploying to Cloudflare" |
| 3 | **If you add an API key to the public site, protect it** (Cloudflare Access or a rate limit) | Otherwise anyone with the link can use up the AI credits |

### 🟠 AI quality
| # | Task |
|---|---|
| 4 | OCR so scanned PDFs / photos can be read |
| 5 | Old `.doc` Word files; real page numbers for Word files; keeping the original files |
| 6 | A smarter demo engine (AI document summaries are done) |

### 🟡 When a shared workspace is needed
| # | Task |
|---|---|
| 7 | Bring back a server database (the PostgreSQL version in git, or Cloudflare D1) so a team shares one workspace |
| 8 | Real server-side logins, organizations/teams, password reset, admin screen for roles |

### 🔵 Integrations
| # | Task |
|---|---|
| 9 | Real Google Drive connection (OAuth + Drive API) |
| 10 | Column-mapping step for CSV imports |

### ⚪ Testing and evaluation
| # | Task |
|---|---|
| 11 | Add the browser walkthrough to the repository as automated end-to-end tests |
| 12 | **Real evaluation:** timed study with case workers + accuracy benchmark, to replace the placeholder numbers on the Evaluation page |

---

## 6. How to run it (short version)

```bash
npm install
npm run dev                 # open http://localhost:3000/login and click a demo account
```

No database needed. To deploy: `npx cf auth login` then `npm run deploy`.

Full steps are in [README.md](./README.md#quick-start).
