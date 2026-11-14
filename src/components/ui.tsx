"use client";
import React from "react";
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, FileText, Sparkles } from "lucide-react";

export const NAVY = "#0f2043";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2563eb] text-white shadow-md">
        <ShieldCheck size={20} />
      </div>
      <div className="leading-tight">
        <div className={`text-[15px] font-extrabold tracking-tight ${light ? "text-white" : "text-[#0f2043]"}`}>CaseClarity <span className="text-[#2563eb]">AI</span></div>
        <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${light ? "text-slate-300" : "text-slate-400"}`}>Explainable Legal AI</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "blue" | "green" | "amber" | "red" | "navy" | "violet" }) {
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    navy: "bg-[#0f2043] text-white border-[#0f2043]",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${map[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "slate" | "amber" | "blue" | "green" | "red" | "violet" }> = {
    awaiting_review: { label: "Awaiting Review", tone: "amber" },
    in_progress: { label: "In Progress", tone: "blue" },
    completed: { label: "Completed", tone: "green" },
    missing_docs: { label: "Missing Documents", tone: "red" },
    flagged: { label: "Flagged — Contradiction", tone: "violet" },
    pending: { label: "Pending Review", tone: "amber" },
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

export function ConfidenceBar({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const color = value >= 85 ? "bg-emerald-500" : value >= 70 ? "bg-amber-500" : "bg-rose-500";
  const label = value >= 85 ? "High" : value >= 70 ? "Moderate" : "Low";
  return (
    <div className="flex items-center gap-2">
      <div className={`w-full ${size === "lg" ? "max-w-[220px]" : size === "sm" ? "w-16" : "w-28"} h-2 overflow-hidden rounded-full bg-slate-200`}>
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-extrabold text-slate-700">{value}% · {label}</span>
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
      <Sparkles size={15} className="mt-0.5 shrink-0" />
      <span><b>Demo Mode:</b> No LLM API key configured. Analysis uses a transparent, deterministic demo engine with fictional data. Confidence is an <b>uncalibrated heuristic</b> — not a verified probability. AI never makes final legal decisions.</span>
    </div>
  );
}

export function SafetyBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] leading-relaxed text-blue-900">
      <ShieldCheck size={15} className="mt-0.5 shrink-0" />
      <span><b>Human-in-the-loop:</b> Every recommendation requires human approval. Facts are cited to source documents; interpretations are labeled as AI-generated.</span>
    </div>
  );
}

export function EmptyState({ icon, title, desc, action }: { icon: React.ReactNode; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <div className="mt-3 text-sm font-bold text-slate-800">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-slate-500">{desc}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,32,67,0.06)] ${className}`}>{children}</div>;
}

export function Btn({ children, onClick, variant = "primary", className = "", disabled = false, type = "button" }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger" | "success"; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
  const map = {
    primary: "bg-[#0f2043] text-white hover:bg-[#1e3a5f] shadow-md shadow-[#0f2043]/20",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${map[variant]} ${className}`}>{children}</button>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

export function PriorityDot({ p }: { p: string }) {
  const c = p === "urgent" ? "bg-rose-500" : p === "high" ? "bg-amber-500" : p === "medium" ? "bg-blue-500" : "bg-slate-300";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} title={p} />;
}

export function DocIcon({ type }: { type: string }) {
  return <FileText size={16} className="text-blue-600" />;
}
