"use client";
import Link from "next/link";
import { FolderOpen, Clock, CheckCircle2, AlertTriangle, Plus, UploadCloud, ArrowRight, FileText, Sparkles, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, Badge, StatusBadge, PriorityDot, AiModeBanner, SafetyBanner } from "@/components/ui";
import { fmtTime } from "@/lib/core";

export default function Dashboard() {
  const { cases, docs, recs, audit, user } = useStore();
  const total = cases.length;
  const awaiting = cases.filter(c => c.status === "awaiting_review").length;
  const completed = cases.filter(c => c.status === "completed").length;
  const missing = cases.filter(c => c.status === "missing_docs").length;
  const pendingRecs = recs.filter(r => r.status === "pending").length;

  const stats = [
    { icon: FolderOpen, label: "Total Cases", value: total, sub: "Across all case types" },
    { icon: Clock, label: "Awaiting Review", value: awaiting, sub: `${pendingRecs} pending recommendation(s)` },
    { icon: CheckCircle2, label: "Completed", value: completed, sub: "Approved & archived" },
    { icon: AlertTriangle, label: "Missing Documents", value: missing, sub: "Need follow-up" },
  ];

  const statusCounts = [
    { label: "Awaiting Review", n: cases.filter(c => c.status === "awaiting_review").length, color: "bg-ember-80" },
    { label: "In Progress", n: cases.filter(c => c.status === "in_progress").length, color: "bg-accent" },
    { label: "Completed", n: completed, color: "bg-ember-40" },
    { label: "Missing Docs", n: missing, color: "bg-accent" },
    { label: "Flagged", n: cases.filter(c => c.status === "flagged").length, color: "bg-ember-60" },
  ];
  const max = Math.max(1, ...statusCounts.map(s => s.n));

  return (
    <div className="space-y-6 animate-fadeUp">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-fg">Good to see you, {user?.name?.split(" ")[0] || "Case Worker"}</h1>
          <p className="mt-0.5 text-sm text-muted">Here&apos;s what needs your attention today. AI assists — you decide.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/upload" className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-4 py-2.5 text-sm font-semibold text-fg-2 hover:bg-panel-2"><UploadCloud size={16} /> Upload Documents</Link>
          <Link href="/cases/new" className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover"><Plus size={16} /> New Case</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => (
          s.label === "Awaiting Review" ? (
            <div key={s.label} className="rounded-2xl bg-gradient-to-br from-ember-90 via-ember-70 to-ember-40 p-5 text-white">
              <div className="flex items-center justify-between">
                <s.icon size={18} className="text-white/85" />
                <span className="text-4xl font-medium tracking-tight">{s.value}</span>
              </div>
              <div className="mt-4 text-sm font-medium">{s.label}</div>
              <div className="text-xs text-white/75">{s.sub}</div>
            </div>
          ) : (
            <Card key={s.label} className="p-5">
              <div className="flex items-center justify-between">
                <s.icon size={18} className="text-accent" />
                <span className="text-4xl font-medium tracking-tight text-fg">{s.value}</span>
              </div>
              <div className="mt-4 text-sm font-medium text-fg">{s.label}</div>
              <div className="text-xs text-muted">{s.sub}</div>
            </Card>
          )
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 *:min-w-0">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Cases by Status</h2>
            <Link href="/cases" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">View all <ArrowRight size={12} /></Link>
          </div>
          <div className="mt-4 space-y-3">
            {statusCounts.map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs font-semibold text-muted">{s.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-panel-2"><div className={`h-full rounded-full ${s.color} transition-all`} style={{ width: `${(s.n / max) * 100}%` }} /></div>
                <span className="w-6 text-right text-xs font-semibold text-fg-2">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-panel-2 p-3 text-xs text-muted"><TrendingUp size={13} className="mr-1 inline text-accent" /> <b>{docs.length} documents</b> processed · <b>{recs.length} recommendations</b> generated · <b>{audit.length} audit events</b> recorded.</div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg">Needs Your Review</h2>
          <div className="mt-3 space-y-2.5">
            {recs.filter(r => r.status === "pending").slice(0, 4).map(r => {
              const c = cases.find(x => x.id === r.caseId);
              return (
                <Link key={r.id} href={`/cases/${r.caseId}`} className="block rounded-xl border border-line p-3 transition hover:border-ember-40 hover:bg-ember-10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-fg">{c?.clientName || "Case"}</span>
                    <Badge tone={r.confidence >= 85 ? "green" : "amber"}>{r.confidence}%</Badge>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{r.title}</div>
                </Link>
              );
            })}
            {recs.filter(r => r.status === "pending").length === 0 && <p className="text-xs text-muted">No pending recommendations. Run an analysis on a case to generate one.</p>}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 *:min-w-0">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Recent Cases</h2>
            <Link href="/cases" className="text-xs font-semibold text-accent hover:underline">All cases</Link>
          </div>
          <div className="mt-3 divide-y divide-line">
            {cases.slice(0, 5).map(c => (
              <Link key={c.id} href={`/cases/${c.id}`} className="flex items-center gap-3 py-3 transition hover:bg-panel-2">
                <PriorityDot p={c.priority} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-fg">{c.title}</div>
                  <div className="text-[11px] text-muted">{c.caseNumber} · {c.clientName} · {c.caseType}</div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Recent Activity</h2>
            <Link href="/audit" className="text-xs font-semibold text-accent hover:underline">Full audit trail</Link>
          </div>
          <div className="mt-3 space-y-3">
            {audit.slice(0, 6).map(a => (
              <div key={a.id} className="flex gap-3">
                <div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-panel-2 text-muted">
                  {a.category === "ai" ? <Sparkles size={13} /> : a.category === "document" ? <FileText size={13} /> : <Clock size={13} />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-fg">{a.action} <span className="font-semibold text-muted">· {a.actor}</span></div>
                  <div className="truncate text-[11px] text-muted">{a.details}</div>
                  <div className="text-[10px] text-muted">{fmtTime(a.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AiModeBanner />
        <SafetyBanner />
      </div>
    </div>
  );
}
