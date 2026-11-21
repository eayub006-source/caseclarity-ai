"use client";
import React from "react";
import Link from "next/link";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";

// Brand mark: a solid ember tile with the shield, and the word mark in plain type.
export function Logo({ light = false }: { light?: boolean }) {
  void light; // the app is dark everywhere; kept for call-site compatibility
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">
        <ShieldCheck size={17} strokeWidth={2.2} />
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight text-fg">CaseClarity</div>
        <div className="mt-1 text-[11px] text-muted">Explainable legal AI</div>
      </div>
    </div>
  );
}

// Left half of the sign-in / sign-up screens: black, with the ember light beam.
export function AuthAside({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-canvas p-10 lg:flex">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-[70%] top-0 h-[62%] w-[3px] -translate-x-1/2 animate-beam beam" />
        <div className="absolute left-[70%] top-[45%] h-80 w-[520px] -translate-x-1/2 beam-glow" />
      </div>
      <Link href="/" className="relative w-fit"><Logo /></Link>
      <div className="relative">
        <h2 className="max-w-md text-4xl font-medium leading-[1.08]">{title}</h2>
        <ul className="mt-8 space-y-3 text-sm text-fg-2">
          {lines.map(t => <li key={t} className="flex items-center gap-2.5"><ShieldCheck size={16} className="shrink-0 text-accent" />{t}</li>)}
        </ul>
      </div>
      <p className="relative text-xs text-muted">© 2026 Team HACKSMITHS — fictional demo data, not legal advice.</p>
    </div>
  );
}

type Tone ="slate" | "blue" | "green" | "amber" | "red" | "navy" | "violet";

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  const map: Record<Tone, string> = {
    slate: "bg-panel-2 text-fg-2 border-line-strong",
    blue: "bg-ember-20 text-ember-100 border-ember-40",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    red: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    navy: "bg-accent text-white border-accent",
    violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: Tone }> = {
    awaiting_review: { label: "Awaiting review", tone: "amber" },
    in_progress: { label: "In progress", tone: "blue" },
    completed: { label: "Completed", tone: "green" },
    missing_docs: { label: "Missing documents", tone: "red" },
    flagged: { label: "Flagged — contradiction", tone: "violet" },
    pending: { label: "Pending review", tone: "amber" },
    approved: { label: "Approved", tone: "green" },
    rejected: { label: "Rejected", tone: "red" },
    modified: { label: "Modified", tone: "blue" },
    processed: { label: "Processed", tone: "green" },
    processing: { label: "Processing…", tone: "blue" },
    uploaded: { label: "Uploaded", tone: "slate" },
    failed: { label: "Failed", tone: "red" },
  };
  const m = map[status] || { label: status, tone: "slate" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function AiModeBanner() {
  const { config } = useStore();
  if (config.aiMode === "llm") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-ember-40 bg-ember-10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
        <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" />
        <span><b className="font-semibold text-fg">Live AI</b> ({config.model}): analysis comes from a language model and every citation is checked against your documents. Confidence is an <b className="font-semibold text-fg">uncalibrated heuristic</b>, not a probability. The AI never makes final legal decisions.</span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-100/90">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-amber-300" />
      <span><b className="font-semibold text-amber-200">Demo Mode:</b> no LLM key is configured, so a transparent, deterministic demo engine runs the analysis. Confidence is an <b className="font-semibold text-amber-200">uncalibrated heuristic</b>, not a probability. The AI never makes final legal decisions.</span>
    </div>
  );
}

// Says which engine produced a recommendation.
export function EngineBadge({ engine }: { engine?: string }) {
  if (engine === "llm") return <Badge tone="blue">Live AI</Badge>;
  if (engine === "seed") return <Badge tone="slate">Sample data</Badge>;
  return <Badge tone="amber">Demo engine</Badge>;
}

export function SafetyBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
      <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
      <span><b className="font-semibold text-fg">Human in the loop:</b> every recommendation needs a person to approve it. Facts are cited to source documents; interpretations are labelled as AI-generated.</span>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-panel px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-panel-2 text-muted">{icon}</div>
      <div className="mt-3 text-sm font-semibold text-fg">{title}</div>
      <div className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{desc}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-panel ${className}`}>{children}</div>;
}

export function Btn({ children, onClick, variant = "primary", className = "", disabled = false, type = "button" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const map = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "border border-line-strong bg-panel text-fg hover:border-faint hover:bg-panel-2",
    ghost: "text-fg-2 hover:bg-panel-2 hover:text-fg",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${map[variant]} ${className}`}>{children}</button>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-line-strong bg-panel-2 px-3.5 py-2.5 text-sm text-fg outline-none placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-ember-20";

export function PriorityDot({ p }: { p: string }) {
  const c = p === "urgent" ? "bg-rose-500" : p === "high" ? "bg-accent" : p === "medium" ? "bg-amber-400" : "bg-faint";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} title={p} />;
}
