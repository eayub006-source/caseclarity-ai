# Project Status — CaseClarity AI

> A plain-language summary of **what is done** and **what is remaining**.
> Last updated: **16 November 2026** · Branch: `fix/known-issues`
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

## 2. Quick summary

| Area | Status |
|---|---|
| Login, accounts, roles | ✅ Done |
| Cases (create, list, search, filter, delete) | ✅ Done |
| File upload + text extraction (PDF, DOCX, TXT, CSV, MD) | ✅ Done |
| Required-documents checklist + completeness % | ✅ Done |
| AI analysis — demo engine (no API key) | ✅ Done |
| AI analysis — real LLM (with API key) | 🟡 Built, tested only with a fake AI server |
| Explainable recommendation (evidence, conflicts, missing info, next steps) | ✅ Done |
| Human review (approve / modify / reject, locked after decision) | ✅ Done |
| Audit trail (search, export) | ✅ Done |
| CSV import / export | ✅ Done |
| Google Drive import | 🟡 Simulated only |
| Security basics | ✅ Done (see §3.8) |
| Automated tests | ✅ 41 unit tests + 40 end-to-end API checks (run manually) |
| OCR for scanned PDFs | ❌ Not started |
| Organizations / teams | ❌ Not started |
| Password reset | ❌ Not started |
| Real evaluation results | ❌ Not started |

---

## 3. What is DONE ✅

### 3.1 Accounts and login
- Sign up, sign in, sign out.
- Passwords are stored safely (bcrypt hash — never as plain text).
- Login stays active for 7 days using a secure cookie.
- Password must be at least **8 characters** (checked on the server).
- Too many **wrong** passwords (10 in 15 minutes) → blocked for 15 minutes. Correct logins never count.
  With `TRUST_PROXY=true` (recommended on Vercel) the block applies only to the attacker's IP, so nobody can lock out the real user or the demo account.
- If your login expires, the app sends you back to the sign-in page instead of silently losing your work.
- **Demo account:** `demo@caseclarity.ai` / `demo1234` — only exists when `DEMO_ACCOUNT=true` (or in local development).

### 3.2 Roles
| Role | Can do |
|---|---|
| **Case Worker** (new sign-ups) | Everything except delete cases and reset demo data |
| **Senior Case Worker** (demo account) | Everything, including delete cases and reset demo data |
| **Admin** | Same as Senior Case Worker |

### 3.3 Dashboard
- Live counts: total cases, awaiting review, completed, missing documents.
- Chart of cases by status.
- "Needs your review" list of pending recommendations.
- Recent cases and recent activity (newest first).
- Bell icon shows the real number of recommendations waiting for review.

### 3.4 Cases
- Create a case (title, client, type, priority, description).
- List, search and filter cases (also from the top search bar).
- Case numbers are unique even if two people create cases at the same time.
- Each case page has tabs: **Overview, Documents, Analysis, Recommendation, Human Review, Audit**.
- Flag a case for investigation, log a document request, delete a case (senior roles).

### 3.5 Documents
- Drag-and-drop or click to upload **PDF, DOCX, TXT, CSV, MD** (max 10 MB each).
- Text is extracted on the server:
  - **PDF** → real page-by-page text.
  - **DOCX / TXT / CSV / MD** → text split into *estimated* pages (labelled "estimated").
- View or download the extracted text.
- Failed uploads clearly show ❌ and the reason.
- **Required-documents checklist** per case type (e.g. Eviction needs ID, lease, notice, proof of income, rent history). It recognises similar names — e.g. `Pay_Stubs.pdf` counts as "Proof of Income".
- **Completeness %** is calculated from the checklist and saved.

### 3.6 AI analysis
**Demo engine** (used when no AI key is set):
- Finds the client's name, dates (labelled: deadline, effective date, date of birth…) and money amounts (labelled: rent, income, arrears, bill, debt…).
- Finds **conflicts** only between similar things (e.g. two different salaries, two different rents, "position eliminated" but "position refilled").
- Decides: *request missing documents* / *investigate conflicts* / *obtain remaining documents* / *proceed*.
- Gives sensible results on all 6 sample cases.

**Real AI (LLM)** (used when `LLM_API_KEY` is set):
- Works with any OpenAI-compatible API (default model `gpt-4o-mini`).
- The server sends the documents with clear file and page markers.
- **Every citation is checked** against the real documents. If the AI quotes something that isn't there, or a file that doesn't exist, the fact is marked **"Unverified"** with low confidence.
- If the AI fails or times out, the app falls back to the demo engine and records why.

**Labels are honest:** the app shows "Live AI" or "Demo Mode" correctly, and every recommendation says which engine made it (Live AI / Demo engine / Sample data).

### 3.7 Recommendation and human review
- Shows: title, summary, reasons, confidence (marked "uncalibrated"), evidence with file + page + quote, conflicts, missing information, uncertainties, next steps.
- **Approve / Modify / Reject** with a comment.
- The reviewer's name always comes from the logged-in user (cannot be faked).
- After approve or reject, the recommendation is **locked**.
- The app only says "saved" if the save really worked.

### 3.8 Security
- Every data API requires login.
- Requests from other websites are blocked (CSRF protection).
- All input is checked on the server.
- Audit entries and reviews always use the real logged-in user's name.
- Deleting a case removes its documents and facts, but **keeps its audit history**.
- The AI API key stays on the server only.

### 3.9 Audit trail
- Every upload, analysis, review, import, export, delete and reset is logged with person and time.
- Search and filter by category; export to CSV.

### 3.10 Integrations
- **CSV import:** reads client, title, type, priority, status, date, description, assignee. Reports duplicates, bad dates, unknown values and missing columns.
- **CSV export:** cases and audit trail, properly quoted (commas and quotes are safe).
- **Google Drive:** simulated (clearly labelled), with a case picker.

### 3.11 Developer setup
- `npm run dev` · `npm test` · `npm run lint` · `npm run typecheck` · `npm run build` · `npm run db:push`
- Database settings come from `.env` (`DATABASE_URL`).
- Typecheck, lint, build and all 41 tests pass.

---

## 4. What is REMAINING ❌

### 🔴 High priority (before the final demo)
| # | Task | Why it matters |
|---|---|---|
| 1 | **Test the real AI with a real API key** | Only tested against a fake AI server so far. |
| 2 | **Click through the whole app in a browser** | Code and APIs are tested, screens were not checked by hand after the fixes. |
| 3 | **Merge `fix/known-issues` into `main`** | The fixes are on a separate branch. |
| 4 | **Set `DEMO_ACCOUNT=true` and `TRUST_PROXY=true` on the judges' deployment** | Otherwise the demo login is off in production, and strangers could temporarily lock it with wrong passwords. |
| 5 | **Run `npm run db:push` + "Reset demo data" on existing databases** | New database columns were added. |

### 🟠 Medium priority (AI quality)
| # | Task |
|---|---|
| 6 | **OCR** so scanned PDFs / photos can be read |
| 7 | Support old **`.doc`** Word files |
| 8 | **Real page numbers for Word files** (now estimated) |
| 9 | **Keep the original uploaded files** (now only the text is saved) |
| 10 | Per-document summaries |
| 11 | Smarter demo engine (more field types, more conflict rules) |

### 🟡 Security and accounts
| # | Task |
|---|---|
| 12 | **Organizations / teams** — today every user of a deployment sees every case |
| 13 | Password reset and email verification |
| 14 | Admin screen to change user roles |
| 15 | Shared rate limiting (today it is per server instance) |
| 16 | Encrypted file storage and data-retention rules |

### 🔵 Integrations
| # | Task |
|---|---|
| 17 | **Real Google Drive** connection (OAuth + Drive API) |
| 18 | Column-mapping step for CSV imports |

### ⚪ Testing and evaluation
| # | Task |
|---|---|
| 19 | Automated API tests in the repo (they were run manually against a test database) |
| 20 | Automated browser (end-to-end) tests |
| 21 | CI pipeline (run tests on every push) |
| 22 | **Real evaluation**: timed study with case workers + accuracy benchmark, to replace the placeholder numbers on the Evaluation page |

---

## 5. How to run it (short version)

```bash
npm install
copy .env.example .env      # set DATABASE_URL to your PostgreSQL database
npm run db:push             # create the tables
npm run dev                 # open http://localhost:3000/login
```

Login: **`demo@caseclarity.ai`** / **`demo1234`**

Full setup steps are in [README.md](./README.md#installation-and-local-setup).
