"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Plus, Download, Filter, FolderOpen } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, Badge, StatusBadge, PriorityDot, EmptyState, Btn } from "@/components/ui";
import { fmtDate, CASE_TYPES } from "@/lib/core";

export default function CasesPage() {
  const { cases, log } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");

  const filtered = useMemo(() => cases.filter(c => {
    const matchQ = (c.title + c.clientName + c.caseNumber).toLowerCase().includes(q.toLowerCase());
    const matchS = status === "all" || c.status === status;
    const matchT = type === "all" || c.caseType === type;
    return matchQ && matchS && matchT;
  }), [cases, q, status, type]);

  const exportCSV = () => {
    const header = "Case Number,Title,Client,Type,Status,Priority,Assigned To,Completeness %,Created\n";
    const rows = cases.map(c => [c.caseNumber, `"${c.title.replace(/"/g, '""')}"`, c.clientName, c.caseType, c.status, c.priority, c.assignedTo, c.completeness, fmtDate(c.createdAt)].join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "caseclarity-cases-export.csv"; a.click();
    URL.revokeObjectURL(url);
    log(null, "CSV export", `Exported ${cases.length} cases to CSV`, "integration");
  };

  return (
    <div className="space-y-5 animate-fadeUp">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0f2043]">Cases</h1>
          <p className="mt-0.5 text-sm text-slate-500">{filtered.length} of {cases.length} cases · Search and filter to find a case quickly.</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" onClick={exportCSV}><Download size={15} /> Export CSV</Btn>
          <Link href="/cases/new"><Btn><Plus size={15} /> New Case</Btn></Link>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title, client, or case number…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none">
            <option value="all">All statuses</option>
            <option value="awaiting_review">Awaiting Review</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="missing_docs">Missing Documents</option>
            <option value="flagged">Flagged</option>
          </select>
          <select value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none">
            <option value="all">All types</option>
            {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={<FolderOpen size={22} />} title="No cases match your filters" desc="Try clearing the search or choosing a different status / type." action={<Btn onClick={() => { setQ(""); setStatus("all"); setType("all"); }}>Clear filters</Btn>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(c => (
            <Link key={c.id} href={`/cases/${c.id}`} className="group">
              <Card className="flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="navy">{c.caseNumber}</Badge>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400"><PriorityDot p={c.priority} /> {c.priority}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-[15px] font-extrabold leading-snug text-[#0f2043]">{c.title}</h3>
                <div className="mt-1 text-xs font-semibold text-slate-500">{c.clientName} · {c.caseType}</div>
                <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">{c.description}</p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400"><span>Document completeness</span><span>{c.completeness}%</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.completeness >= 80 ? "bg-emerald-500" : c.completeness >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${c.completeness}%` }} /></div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <StatusBadge status={c.status} />
                  <span className="text-[11px] text-slate-400">{fmtDate(c.createdAt)} · {c.assignedTo}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
