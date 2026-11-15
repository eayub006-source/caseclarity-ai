"use client";
import { useRef, useState } from "react";
import { Plug, Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet, HardDrive, RefreshCw, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, Badge, Btn, DemoBanner } from "@/components/ui";
import { DRIVE_FILES, uid, fmtDate } from "@/lib/core";
import { parseCasesCSV, buildCasesFromRows } from "@/lib/csv";

interface ImportReport { total: number; added: number; skipped: number; warnings: string[]; }

export default function IntegrationsPage() {
  const { cases, importCases, log, addDoc, notify } = useStore();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [driveImported, setDriveImported] = useState<string[]>([]);
  const [exported, setExported] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  // Standards-compliant CSV parsing (RFC 4180) via PapaParse — handles
  // quoted fields, embedded commas/newlines and CRLF correctly.
  const handleCSV = async (file: File) => {
    const text = await file.text();
    const { headers, rows, errors } = parseCasesCSV(text);
    const warnings: string[] = [...errors];
    if (!headers.some(h => h.includes("client") || h.includes("name"))) warnings.push("No client/name column found — defaults will be used.");
    if (!headers.some(h => h.includes("title") || h.includes("case"))) warnings.push("No title column found — default titles generated.");
    const { items, warnings: buildWarnings, dateFormats } = buildCasesFromRows(rows);
    warnings.push(...buildWarnings);
    if (dateFormats.length > 1) warnings.push(`Mixed date formats detected (${dateFormats.join(", ")}) — normalized to ISO.`);
    if (rows.length === 0) warnings.push("File has a header but no data rows.");
    const { added, skipped } = await importCases(items);
    if (skipped > 0) warnings.push(`${skipped} duplicate record(s) skipped (same client + title).`);
    setReport({ total: rows.length, added, skipped, warnings });
    log(null, "CSV import", `Imported ${added} case(s), skipped ${skipped} duplicate(s) from ${file.name}`, "integration");
  };

  const exportCSV = () => {
    const header = "Case Number,Title,Client,Type,Status,Priority,Assigned To,Completeness %,Created\n";
    const rows = cases.map(c => [c.caseNumber, `"${c.title.replace(/"/g, '""')}"`, c.clientName, c.caseType, c.status, c.priority, c.assignedTo, c.completeness, fmtDate(c.createdAt)].join(",")).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "caseclarity-cases-export.csv"; a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    log(null, "CSV export", `Exported ${cases.length} cases to CSV`, "integration");
  };

  const importDrive = (name: string) => {
    const target = cases[0];
    if (!target) { notify("Create a case first, then import Drive files into it.", "warn"); return; }
    addDoc({ id: uid(), caseId: target.id, name, type: "PDF", size: 120000, status: "processed", extractedText: `Imported from Google Drive (simulated): ${name}. Demo Mode — content indexed for analysis.`, pageCount: 2, uploadedAt: new Date().toISOString(), source: "Google Drive (simulated)" });
    setDriveImported(prev => [...prev, name]);
    log(target.id, "Document imported", `${name} via Google Drive (simulated) into ${target.caseNumber}`, "integration");
  };

  const sampleCSV = () => {
    const csv = "client_name,title,case_type,date\nSarah Miller,Eviction Defense — Notice Review,Housing / Eviction,05/01/2026\nTom Baker,Benefits Appeal — Denial,Benefits Appeal,2026-05-02\nSarah Miller,Eviction Defense — Notice Review,Housing / Eviction,05/01/2026\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sample-import.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0f2043]">Integrations</h1>
        <p className="mt-0.5 text-sm text-slate-500">Connect existing systems without assuming clean APIs. Simulated integrations are clearly labeled.</p>
      </div>
      <DemoBanner />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Google Drive */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><HardDrive size={20} /></div>
              <div><h2 className="text-sm font-extrabold text-[#0f2043]">Google Drive Import</h2><div className="text-[11px] text-slate-400">Simulated — no live connection</div></div>
            </div>
            <Badge tone="amber">Simulated</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Browse shared Drive files and import them into your first case. In production, this would use the Drive API with OAuth. Here it is a clearly labeled simulation.</p>
          <div className="mt-4 space-y-2">
            {DRIVE_FILES.map(f => {
              const done = driveImported.includes(f.name);
              return (
                <div key={f.name} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <FileSpreadsheet size={16} className="shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{f.name}</div><div className="text-[10px] text-slate-400">{f.size} · Modified {f.modified} · {f.shared ? "Shared with you" : "Not shared"}</div></div>
                  <Btn variant={done ? "secondary" : "primary"} onClick={() => importDrive(f.name)} disabled={done}>{done ? <><CheckCircle2 size={13} /> Imported</> : "Import"}</Btn>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><RefreshCw size={12} /> Last sync: never (simulated). Imports land in your first case and are audit-logged.</div>
        </Card>

        {/* CSV */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Upload size={20} /></div>
              <div><h2 className="text-sm font-extrabold text-[#0f2043]">CSV Case Management Import / Export</h2><div className="text-[11px] text-slate-400">Functional — handles messy real-world CSVs</div></div>
            </div>
            <Badge tone="green">Live</Badge>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Import cases from any CSV system. Missing columns, mixed date formats, incomplete rows and duplicates are detected and reported — never silently dropped.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => csvRef.current?.click()}><Upload size={15} /> Import CSV</Btn>
            <Btn variant="secondary" onClick={exportCSV}><Download size={15} /> Export Cases CSV</Btn>
            <Btn variant="ghost" onClick={sampleCSV}>Download sample CSV</Btn>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleCSV(e.target.files[0])} />
          </div>
          {exported && <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14} /> Export downloaded — check your downloads folder.</div>}
          {report && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-extrabold text-slate-800">Import Report</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                {[{ k: "Rows read", v: report.total }, { k: "Added", v: report.added }, { k: "Duplicates skipped", v: report.skipped }].map(s => (
                  <div key={s.k} className="rounded-lg bg-white p-2"><div className="text-lg font-extrabold text-[#0f2043]">{s.v}</div><div className="text-[10px] font-semibold text-slate-400">{s.k}</div></div>
                ))}
              </div>
              {report.warnings.length > 0 && <ul className="mt-3 space-y-1.5 text-[11px] text-slate-600">{report.warnings.map((w, i) => <li key={i} className="flex gap-2"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />{w}</li>)}</ul>}
              {report.warnings.length === 0 && <p className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-emerald-700"><CheckCircle2 size={12} /> Clean import — no issues detected.</p>}
            </div>
          )}
          <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400"><XCircle size={12} className="mt-0.5 shrink-0" /> Expected columns (flexible): client_name, title, case_type, date. Unknown columns are ignored safely.</div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#0f2043]"><Plug size={15} /> Integration Principles</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[{ t: "Never pretend a connection is live", d: "Simulated integrations are labeled 'Simulated' with a Demo Mode banner." }, { t: "Report, don't silently drop", d: "Duplicates, missing columns and bad dates produce a visible import report." }, { t: "Audit every import/export", d: "Each transfer is written to the audit trail with actor and timestamp." }].map(x => (
            <div key={x.t} className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-extrabold text-slate-800">{x.t}</div><div className="mt-1 text-[11px] leading-relaxed text-slate-500">{x.d}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
