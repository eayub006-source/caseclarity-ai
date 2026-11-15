"use client";
import Link from "next/link";
import { ShieldCheck, FileSearch, Scale, History, ArrowRight, Play, CheckCircle2, Lock, Users, BarChart3, Upload, BrainCircuit, ClipboardCheck, Database, ChevronRight, Sparkles, AlertTriangle, FileText, Search } from "lucide-react";
import { Logo, Badge } from "@/components/ui";

const FEATURES = [
  { icon: FileSearch, title: "AI Document Analysis", desc: "Summarize lengthy filings, extract names, dates, income and facts — every fact cited to its source document and page." },
  { icon: BrainCircuit, title: "Explainable Recommendations", desc: "Each recommendation shows why it was generated, supporting evidence, confidence, missing information and uncertainties." },
  { icon: ClipboardCheck, title: "Human Review System", desc: "Approve, reject, modify or comment. The AI never makes final legal decisions — case workers always have the last word." },
  { icon: History, title: "Complete Audit Trail", desc: "Uploads, AI analysis, extractions, recommendations and every human action — timestamped and exportable." },
  { icon: AlertTriangle, title: "Contradiction & Gap Detection", desc: "Flags inconsistent figures across documents and lists exactly which required documents are still missing." },
  { icon: Database, title: "CSV & Drive Integrations", desc: "Import from Google Drive (simulated) and CSV case systems — with duplicate, date-format and missing-column handling." },
];

const STEPS = [
  { icon: Upload, title: "1. Upload Documents", desc: "Drag & drop PDFs, DOCX or TXT. Text is extracted and processing status is tracked per file." },
  { icon: FileSearch, title: "2. Extract & Analyze", desc: "Demo AI extracts facts with page-level citations and checks for contradictions and missing items." },
  { icon: BrainCircuit, title: "3. Explainable Recommendation", desc: "A recommendation is generated with evidence, confidence, uncertainties and next steps — never as bare fact." },
  { icon: Scale, title: "4. Human Review", desc: "A case worker approves, rejects or modifies. Every action is recorded in the audit trail." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/"><Logo /></Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
            <a href="#features" className="hover:text-[#0f2043]">Features</a>
            <a href="#how" className="hover:text-[#0f2043]">How It Works</a>
            <a href="#safety" className="hover:text-[#0f2043]">Safety</a>
            <a href="#about" className="hover:text-[#0f2043]">About</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 sm:block">Sign in</Link>
            <Link href="/signup" className="rounded-xl bg-[#0f2043] px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-[#1e3a5f]">Get Started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#f0f6ff] via-white to-white">
        <div className="pointer-events-none absolute -top-32 right-0 h-96 w-96 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-indigo-100/60 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:pt-20">
          <div className="animate-fadeUp">
            <Badge tone="blue"><Sparkles size={12} /> Built for Build for Campus 2026 · Team HACKSMITHS</Badge>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-[#0f2043] sm:text-5xl lg:text-[3.4rem]">
              Understand Every AI Decision. <span className="bg-gradient-to-r from-[#2563eb] to-[#0f2043] bg-clip-text text-transparent">Trust Every Case.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              CaseClarity AI helps legal-aid case workers make sense of long, inconsistent documents — with evidence-backed recommendations, confidence indicators, uncertainty warnings and a fully auditable decision history. The AI assists. Humans decide.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-[#0f2043] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#0f2043]/25 transition hover:bg-[#1e3a5f]">Get Started <ArrowRight size={16} /></Link>
              <a href="#features" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"><Play size={16} /> Explore Features</a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Lock size={13} className="text-emerald-600" /> Fictional demo data only</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-blue-600" /> Human-in-the-loop by design</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" /> Demo account for judges</span>
            </div>
          </div>

          {/* Product preview card */}
          <div className="animate-fadeUp" style={{ animationDelay: "120ms" }}>
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,32,67,0.14)]">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Case CC-2026-003 · Recommendation</span>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-[#0f2043]">Investigate Contradictions Before Filing</div>
                    <div className="mt-1 text-xs leading-relaxed text-slate-500">Salary mismatch: $62,000 vs $69,600 across 2 documents. Timeline evidence supports further inquiry.</div>
                  </div>
                  <Badge tone="amber">74% · Moderate</Badge>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Supporting evidence</div>
                  <div className="mt-2 space-y-2 text-xs text-slate-700">
                    <div className="flex gap-2"><FileText size={13} className="mt-0.5 shrink-0 text-blue-600" /><span><b>Termination_Letter.pdf</b> · p.1 — “Effective date: April 10, 2026. Position elimination.”</span></div>
                    <div className="flex gap-2"><FileText size={13} className="mt-0.5 shrink-0 text-blue-600" /><span><b>Pay_Stub_Mar.pdf</b> · p.1 — “Gross $5,800/month ($69,600/year)”</span></div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">✓ Approve</span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600">✎ Modify</span>
                  <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">✕ Reject</span>
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">Demo confidence — uncalibrated</span>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[{ k: "6", v: "Demo cases" }, { k: "15", v: "Documents" }, { k: "100%", v: "Auditable" }].map(s => (
                <div key={s.v} className="rounded-2xl border border-slate-200 bg-white py-3 shadow-sm">
                  <div className="text-lg font-extrabold text-[#0f2043]">{s.k}</div>
                  <div className="text-[11px] font-semibold text-slate-400">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Badge tone="blue">Platform Features</Badge>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#0f2043]">Everything a case worker needs to trust the AI</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">Transparency is the product. Every output is traceable to its source — and every decision is reviewable by a human.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] text-white shadow-md"><f.icon size={20} /></div>
              <h3 className="mt-4 text-base font-extrabold text-[#0f2043]">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-[#0f2043] py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="blue">How It Works</Badge>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Upload → Extract → Analyze → Recommend → Review</h2>
            <p className="mt-3 text-sm text-slate-300">The complete workflow, with a human decision recorded at every step.</p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-blue-300"><s.icon size={20} /></div>
                <h3 className="mt-4 text-sm font-extrabold">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{s.desc}</p>
                {i < 3 && <ChevronRight size={18} className="absolute right-4 top-6 hidden text-slate-500 lg:block" />}
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-[#0f2043] shadow-lg transition hover:bg-blue-50">Try the live demo <ArrowRight size={16} /></Link>
            <p className="mt-3 text-xs text-slate-400">Demo account: demo@caseclarity.ai · demo1234</p>
          </div>
        </div>
      </section>

      {/* Safety + About */}
      <section id="safety" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={22} /></div><h3 className="text-lg font-extrabold text-[#0f2043]">Safety & Reliability by Design</h3></div>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              {["AI never makes final legal decisions — human approval is mandatory.", "Facts are cited to source documents; AI interpretations are clearly labeled.", "Confidence scores are shown as uncalibrated demo heuristics, never as verified probabilities.", "Uncertainty and missing information are surfaced, not hidden.", "All demo data is fictional. Real deployments must protect confidential client documents."].map(t => (
                <li key={t} className="flex gap-2.5"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />{t}</li>
              ))}
            </ul>
          </div>
          <div id="about" className="scroll-mt-20 rounded-3xl border border-slate-200 bg-gradient-to-br from-[#f0f6ff] to-white p-7 shadow-sm">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Users size={22} /></div><h3 className="text-lg font-extrabold text-[#0f2043]">About CaseClarity AI</h3></div>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">Built by <b>Team HACKSMITHS</b> for the <b>Build for Campus 2026</b> hackathon. Small legal-aid nonprofits handle long, inconsistent paperwork with limited staff. CaseClarity AI reduces review time while keeping every AI output explainable and every decision auditable.</p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[{ icon: BarChart3, k: "Evaluation", v: "Demo metrics included" }, { icon: Search, k: "Search & Filters", v: "Across all cases" }, { icon: Database, k: "CSV / Drive", v: "Import & export" }].map(x => (
                <div key={x.k} className="rounded-xl bg-white p-3 shadow-sm"><x.icon size={18} className="mx-auto text-blue-600" /><div className="mt-1.5 text-xs font-extrabold text-slate-800">{x.k}</div><div className="text-[11px] text-slate-400">{x.v}</div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-center text-xs text-slate-400">© 2026 CaseClarity AI · Team HACKSMITHS · Build for Campus 2026 · Fictional demo data — not legal advice.</p>
          <div className="flex gap-4 text-xs font-semibold text-slate-500"><a href="#features" className="hover:text-[#0f2043]">Features</a><a href="#how" className="hover:text-[#0f2043]">How It Works</a><Link href="/login" className="hover:text-[#0f2043]">Sign in</Link></div>
        </div>
      </footer>
    </div>
  );
}
