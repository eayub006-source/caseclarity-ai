"use client";
import Link from "next/link";
import { ArrowUpRight, FileSearch, History, AlertTriangle, Home, HandCoins, Briefcase, Users, Plane, Receipt, LayoutDashboard, FolderOpen, UploadCloud, ShieldCheck, FileText } from "lucide-react";
import { Logo } from "@/components/ui";
import { seedCases } from "@/data/demo-data";

// Live figures from the demo dataset, so the preview never shows invented numbers.
const CASES = seedCases().sort((a, b) => a.caseNumber.localeCompare(b.caseNumber));
const count = (s: string) => CASES.filter(c => c.status === s).length;

const CASE_TYPES = [
  { icon: Home, label: "Housing and eviction" },
  { icon: HandCoins, label: "Benefits appeals" },
  { icon: Briefcase, label: "Employment" },
  { icon: Users, label: "Family law" },
  { icon: Plane, label: "Immigration" },
  { icon: Receipt, label: "Consumer debt" },
];

const EXPLANATION = ["Reasoning", "Evidence", "Source page", "Confidence", "Missing information", "Uncertainties", "Next steps"];

const SCENARIOS = [
  { big: "100%", case: "CC-2026-001", client: "Maria Gonzalez · Eviction", line: "Every required document is on file. Recommends an emergency stay with a payment plan." },
  { big: "4", case: "CC-2026-002", client: "James Carter · SNAP appeal", line: "Four documents are missing. Advises gathering income proof before the May 28 appeal deadline." },
  { big: "$7,600", case: "CC-2026-003", client: "Aisha Thompson · Employment", line: "The salary differs by $7,600 between two documents. Flags the conflict for a person to resolve." },
];

const FEATURES = [
  { icon: FileSearch, title: "Reads every page", desc: "Names, dates and amounts are pulled from PDFs and Word files, each tied to the page it came from." },
  { icon: AlertTriangle, title: "Finds gaps and conflicts", desc: "Lists the documents a case still needs and flags figures that disagree between files." },
  { icon: History, title: "Keeps a full record", desc: "Uploads, analyses and every human decision are timestamped and exportable as CSV." },
];

const STEPS = [
  { title: "Upload", desc: "Drop in PDF, Word, text or CSV files. Text is read in your browser." },
  { title: "Extract", desc: "Facts are pulled out with the document and page they came from." },
  { title: "Analyse", desc: "Gaps and conflicting figures are checked against the case type." },
  { title: "Recommend", desc: "A suggested next step arrives with its evidence and its doubts." },
  { title: "Decide", desc: "A case worker approves, edits or rejects it — and it is recorded." },
];

function Preview() {
  const awaiting = count("awaiting_review"), missing = count("missing_docs"), flagged = count("flagged");
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_40px_120px_-40px_rgba(232,80,31,0.45)]">
      <div className="flex">
        <aside className="hidden w-44 shrink-0 border-r border-line p-3 md:block">
          <div className="flex items-center gap-2 px-2 py-1.5"><div className="grid h-6 w-6 place-items-center rounded-md bg-accent"><ShieldCheck size={13} className="text-white" /></div><span className="text-xs font-semibold">CaseClarity</span></div>
          <div className="mt-3 space-y-1 text-[11px]">
            {[{ i: LayoutDashboard, t: "Dashboard", a: true }, { i: FolderOpen, t: "Cases" }, { i: UploadCloud, t: "Upload" }, { i: History, t: "Audit trail" }].map(n => (
              <div key={n.t} className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${n.a ? "bg-accent text-white" : "text-muted"}`}><n.i size={12} />{n.t}</div>
            ))}
          </div>
        </aside>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Dashboard</span>
            <span className="rounded-full border border-line-strong px-2.5 py-1 text-[10px] text-muted">Demo Mode</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gradient-to-br from-ember-90 via-ember-70 to-ember-40 p-3.5">
              <div className="text-[11px] text-white/80">Awaiting your review</div>
              <div className="mt-1 text-3xl font-medium tracking-tight text-white">{awaiting}</div>
              <div className="mt-2 inline-flex rounded-full bg-black/25 px-2 py-0.5 text-[10px] text-white">Open the queue</div>
            </div>
            {[{ k: "Missing documents", v: missing }, { k: "Contradictions flagged", v: flagged }].map(s => (
              <div key={s.k} className="rounded-xl border border-line bg-panel-2 p-3.5">
                <div className="text-[11px] text-muted">{s.k}</div>
                <div className="mt-1 text-3xl font-medium tracking-tight">{s.v}</div>
                <div className="mt-2 flex h-5 items-end gap-0.5">{[4, 7, 5, 9, 6, 10, 8].map((h, i) => <span key={i} className="w-full rounded-sm bg-ember-60" style={{ height: `${h * 10}%` }} />)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-line bg-panel-2 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium">Required documents on file</span>
              <span className="text-[10px] text-muted">by case</span>
            </div>
            <div className="mt-3 flex h-28 items-end gap-2 sm:gap-3">
              {CASES.map(c => (
                <div key={c.id} className="flex h-full flex-1 flex-col justify-end gap-1.5">
                  <div className="relative rounded-t-md bg-gradient-to-t from-ember-40 to-accent" style={{ height: `${Math.max(6, c.completeness)}%` }}>
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-fg-2">{c.completeness}%</span>
                  </div>
                  <span className="text-center text-[9px] text-muted">{c.caseNumber.slice(-3)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-fg">
      {/* Nav */}
      <header className="relative z-30 mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="CaseClarity home"><Logo /></Link>
        <nav className="hidden items-center gap-1 rounded-full border border-line bg-panel/70 p-1 text-[13px] backdrop-blur md:flex">
          <a href="#top" className="rounded-full bg-accent px-4 py-1.5 font-medium text-white">Overview</a>
          {[["#features", "Features"], ["#how", "How it works"], ["#safety", "Safety"], ["#about", "About"]].map(([h, t]) => (
            <a key={h} href={h} className="rounded-full px-4 py-1.5 text-fg-2 transition hover:text-fg">{t}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-[13px] text-fg-2 hover:text-fg sm:block">Sign in</Link>
          <Link href="/login" className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:bg-accent-hover">Try the demo</Link>
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[820px] overflow-hidden">
          <div className="absolute left-[68%] top-0 h-[600px] w-[4px] -translate-x-1/2 animate-beam beam" />
          <div className="absolute left-[68%] top-[380px] h-[440px] w-[900px] -translate-x-1/2 beam-glow" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:88px_100%] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel/80 px-3 py-1 text-xs text-fg-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Explainable AI for legal-aid teams</span>
          <h1 className="mt-6 max-w-6xl text-[2.6rem] font-medium leading-[1.04] sm:text-6xl lg:text-[4.75rem]">Understand every AI decision.<br className="hidden lg:block" /> Trust every case.</h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-fg-2 sm:text-lg">CaseClarity reads long, messy case files and suggests a next step — showing the facts, the page each one came from, and what is still missing. A case worker always makes the call.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-hover">Try the demo <ArrowUpRight size={16} /></Link>
            <a href="#how" className="inline-flex items-center rounded-full border border-line-strong px-6 py-3 text-sm font-medium text-fg transition hover:border-faint">See how it works</a>
          </div>
          <div className="relative mt-14 sm:mt-20"><Preview /></div>
        </div>
      </section>

      {/* Case types */}
      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <p className="text-center text-sm text-muted">Built around the cases legal-aid teams handle every week</p>
        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-fg-2 sm:grid-cols-3 lg:grid-cols-6">
          {CASE_TYPES.map(t => (
            <div key={t.label} className="flex items-center justify-center gap-2 text-sm"><t.icon size={17} className="text-faint" />{t.label}</div>
          ))}
        </div>
      </section>

      {/* Statement + anatomy */}
      <section className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
          <h2 className="text-3xl font-medium leading-tight sm:text-[2.6rem]">Every recommendation shows its working <span className="text-faint">— the facts, where they came from, and what is still unknown.</span></h2>
          <div>
            <p className="max-w-md text-sm leading-relaxed text-fg-2">An unexplained score invites blind trust. So each recommendation arrives with the same seven parts, and its confidence is always labelled as an uncalibrated estimate.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {EXPLANATION.map(t => <span key={t} className="rounded-full border border-line-strong px-3 py-1 text-xs text-fg-2">{t}</span>)}
            </div>
          </div>
        </div>
        <div className="mt-10 grid gap-3 rounded-2xl border border-line bg-panel p-4 sm:p-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-xs text-muted">CC-2026-003 · Recommendation</div>
            <div className="mt-2 text-xl font-medium sm:text-2xl">Investigate the contradictions before filing</div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-2">The accommodation request came seven weeks before the termination, and the “eliminated” role was refilled five days later. But the salary on the termination letter does not match the pay stub.</p>
            <div className="mt-5 space-y-2.5">
              {[["Termination_Letter_Thompson.pdf", "page 1", "Effective date: April 10, 2026. Reason stated: ‘Position elimination.’"], ["Pay_Stub_Thompson_Mar.pdf", "page 1", "Gross $5,800/month ($69,600/year)"]].map(([d, p, q]) => (
                <div key={d} className="flex gap-3 rounded-xl border border-line bg-panel-2 p-3 text-sm">
                  <FileText size={16} className="mt-0.5 shrink-0 text-accent" />
                  <div className="min-w-0"><div className="truncate text-fg">{d} <span className="text-muted">— {p}</span></div><div className="mt-0.5 text-fg-2">“{q}”</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col justify-between gap-6 rounded-xl bg-gradient-to-br from-ember-80 via-ember-60 to-ember-20 p-5">
            <div>
              <div className="text-sm text-white/80">Confidence</div>
              <div className="mt-1 text-6xl font-medium tracking-tight text-white">74</div>
              <div className="mt-1 text-xs text-white/75">Uncalibrated estimate, not a probability</div>
            </div>
            <div className="space-y-1.5 text-sm text-white/90">
              <div>Missing: HR raise memo</div>
              <div>Missing: job posting for the refilled role</div>
              <div className="pt-2 text-xs text-white/70">Waiting for a case worker’s decision</div>
            </div>
          </div>
        </div>
      </section>

      {/* Scenarios */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-8 px-4 pt-24 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <h2 className="max-w-lg text-3xl font-medium leading-tight sm:text-[2.6rem]">Three cases, three kinds of problem</h2>
          <p className="max-w-sm text-sm leading-relaxed text-fg-2">The demo ships with fictional cases chosen to show a complete file, a file with gaps, and a file that contradicts itself.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {SCENARIOS.map(s => (
            <div key={s.case} className="relative flex min-h-72 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-b from-ember-90 via-ember-60 to-ember-20 p-6">
              <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
              <div className="relative text-5xl font-medium tracking-tight text-white sm:text-6xl">{s.big}</div>
              <div className="relative">
                <div className="text-sm font-medium text-white">{s.case}</div>
                <div className="text-xs text-white/75">{s.client}</div>
                <p className="mt-3 text-sm leading-relaxed text-white/90">{s.line}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title}>
              <f.icon size={20} className="text-accent" />
              <h3 className="mt-3 text-base font-medium">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — a real sequence, so it is numbered */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-8 px-4 pt-24 sm:px-6">
        <h2 className="max-w-xl text-3xl font-medium leading-tight sm:text-[2.6rem]">From upload to a decision someone signs off</h2>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-panel p-5">
              <div className="text-sm text-accent">{i + 1}</div>
              <div className="mt-6 text-lg font-medium">{s.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Commitments, stated as facts about the product */}
      <section id="safety" className="mx-auto max-w-7xl scroll-mt-8 px-4 pt-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-medium leading-tight sm:text-[2.6rem]">Built so a person stays in charge</h2>
          <p className="mt-4 text-sm leading-relaxed text-fg-2">These are rules the software enforces, not results from a study.</p>
        </div>
        <div className="mt-12 grid gap-10 text-center sm:grid-cols-3">
          {[["100%", "of extracted facts cite a document and page", "If the AI quotes text that is not in the file, the quote is marked unverified."], ["0", "final decisions made by the AI", "New recommendations start as pending. Only a case worker can approve, edit or reject."], ["7", "parts in every explanation", "Reasoning, evidence, sources, confidence, gaps, doubts and next steps — every time."]].map(([k, t, d]) => (
            <div key={k}>
              <div className="text-6xl font-medium tracking-tight sm:text-7xl">{k}</div>
              <div className="mt-3 text-sm font-medium text-fg">{t}</div>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="about" className="mx-auto max-w-7xl scroll-mt-8 px-4 pt-24 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-line bg-panel px-6 py-14 text-center">
          <div aria-hidden className="absolute left-1/2 top-0 h-40 w-[1px] -translate-x-1/2 beam" />
          <div aria-hidden className="absolute left-1/2 top-24 h-52 w-[560px] -translate-x-1/2 beam-glow" />
          <div className="relative mx-auto max-w-xl">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-accent"><ShieldCheck size={20} className="text-white" /></div>
            <h2 className="mt-5 text-3xl font-medium leading-tight sm:text-4xl">Try it with fictional cases</h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-2">Built by Team HACKSMITHS for Build for Campus 2026. Sign in with one click — your changes are saved only in your browser.</p>
            <Link href="/login" className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:bg-accent-hover">Open the demo <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-7xl px-4 pt-20 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-line pb-8 sm:flex-row sm:items-center">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
            <a href="#features" className="hover:text-fg">Features</a>
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#safety" className="hover:text-fg">Safety</a>
            <Link href="/login" className="hover:text-fg">Sign in</Link>
          </nav>
        </div>
        <div aria-hidden className="outline-word select-none whitespace-nowrap py-4 text-center text-[19vw] font-semibold leading-none tracking-tighter lg:text-[13rem]">CaseClarity</div>
        <div className="flex flex-col justify-between gap-2 border-t border-line py-6 text-xs text-muted sm:flex-row">
          <span>© 2026 Team HACKSMITHS, Build for Campus 2026</span>
          <span>Fictional demo data. Not legal advice.</span>
        </div>
      </footer>
    </div>
  );
}
