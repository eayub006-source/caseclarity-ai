"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { History, Sparkles, FileText, ShieldCheck, Clock, Download, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, Badge, EmptyState, Btn } from "@/components/ui";
import { fmtTime } from "@/lib/core";
import { toCSV, downloadCSV } from "@/lib/csv";

export default function AuditPage() {
  const { audit, cases, log } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const filtered = useMemo(() => audit.filter(a => {
    const mq = (a.action + a.details + a.actor).toLowerCase().includes(q.toLowerCase());
    const mc = cat === "all" || a.category === cat;
    return mq && mc;
  }), [audit, q, cat]);

  const exportAudit = () => {
    downloadCSV("caseclarity-audit-trail.csv", toCSV(
      ["Timestamp", "Actor", "Action", "Category", "Case", "Details"],
      audit.map(a => [a.timestamp, a.actor, a.action, a.category, a.caseId ? (cases.find(c => c.id === a.caseId)?.caseNumber || a.caseId) : "", a.details]),
    ));
    log(null, "Audit export", `Exported ${audit.length} audit events to CSV`, "system");
  };

  const iconFor = (cat: string) => cat === "ai" ? <Sparkles size={13} /> : cat === "document" ? <FileText size={13} /> : cat === "review" ? <ShieldCheck size={13} /> : <Clock size={13} />;
  const colorFor = (cat: string) => cat === "ai" ? "bg-ember-60" : cat === "document" ? "bg-accent" : cat === "review" ? "bg-ember-40" : "bg-faint";

  return (
    <div className="space-y-5 animate-fadeUp">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium tracking-tight text-fg">Audit Trail</h1>
          <p className="mt-0.5 text-sm text-muted">{filtered.length} events · Every upload, analysis, recommendation and human action with date & time.</p>
        </div>
        <Btn variant="secondary" onClick={exportAudit}><Download size={15} /> Export CSV</Btn>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search actions, actors, details…" className="w-full rounded-xl border border-line-strong py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent focus:ring-4 focus:ring-ember-20" />
          </div>
          <select value={cat} onChange={e => setCat(e.target.value)} className="rounded-xl border border-line-strong px-3 py-2.5 text-sm font-semibold text-fg-2 outline-none">
            <option value="all">All categories</option>
            <option value="ai">AI</option><option value="document">Documents</option><option value="review">Human Review</option><option value="case">Cases</option><option value="integration">Integrations</option><option value="system">System</option>
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={<History size={22} />} title="No audit events match" desc="Try a different search or category." />
      ) : (
        <Card className="p-5">
          <div className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
            {filtered.map(a => {
              const c = a.caseId ? cases.find(x => x.id === a.caseId) : null;
              return (
                <div key={a.id} className="relative flex gap-4">
                  <div className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-panel text-white ${colorFor(a.category)}`}>{iconFor(a.category)}</div>
                  <div className="min-w-0 flex-1 rounded-xl bg-panel-2 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg">
                      {a.action}<Badge tone="slate">{a.category}</Badge>
                      {c && <Link href={`/cases/${c.id}`} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-white">{c.caseNumber}</Link>}
                      <span className="ml-auto text-[10px] font-semibold text-muted">{fmtTime(a.timestamp)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-fg-2">{a.details}</div>
                    <div className="text-[10px] text-muted">by {a.actor}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
