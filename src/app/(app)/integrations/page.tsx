"use client";
import { useMemo, useRef, useState } from "react";
import { Plug, Upload, Download, CheckCircle2, AlertTriangle, FileSpreadsheet, HardDrive, RefreshCw, XCircle, Info, Loader2 } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { Card, Badge, Btn } from "@/components/ui";
import { DRIVE_FILES, fmtTime } from "@/lib/core";
import { parseCasesCSV, buildCasesFromRows, toCSV, downloadCSV } from "@/lib/csv";

interface ImportReport { total: number; added: number; skipped: number; invalid: number; warnings: string[]; }

const DRIVE_SOURCE = "Google Drive (simulated)";

export default function IntegrationsPage() {
  const { cases, docs, importCases, log, addDoc, notify } = useStore();
  const [report, setReport] = useState<ImportReport | null>(null);
  const [importing, setImporting] = useState(false);
  const [driveCaseId, setDriveCaseId] = useState("");
  const [driveBusy, setDriveBusy] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const targetCase = cases.find(c => c.id === driveCaseId);
  // "Imported" state comes from the stored documents, so it survives reloads.
  const driveImported = useMemo(
    () => new Set(docs.filter(d => d.source === DRIVE_SOURCE && d.caseId === driveCaseId).map(d => d.name)),
    [docs, driveCaseId],
  );
  const lastDriveImport = useMemo(
    () => docs.filter(d => d.source === DRIVE_SOURCE).map(d => d.uploadedAt).sort().pop(),
    [docs],
  );

  // Standards-compliant CSV parsing (RFC 4180) via PapaParse.
  const handleCSV = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const { headers, rows, errors } = parseCasesCSV(text);
      const warnings: string[] = [...errors];
      if (!headers.some(h => h.includes("client") || h === "name")) warnings.push("No client/name column found — defaults will be used.");
      if (!headers.some(h => h.includes("title") || h === "case")) warnings.push("No title column found — default titles generated.");
      const { items, warnings: buildWarnings, dateFormats } = buildCasesFromRows(rows);
      warnings.push(...buildWarnings);
      if (dateFormats.length > 1) warnings.push(`Mixed date formats detected (${dateFormats.join(", ")}) — each was converted to an ISO date.`);
      if (rows.length === 0) warnings.push("File has a header but no data rows.");
      const { added, skipped, invalid } = rows.length ? await importCases(items) : { added: 0, skipped: 0, invalid: 0 };
      if (skipped > 0) warnings.push(`${skipped} duplicate record(s) skipped (same client + title).`);
      if (invalid > 0) warnings.push(`${invalid} row(s) rejected by the server as invalid.`);
      setReport({ total: rows.length, added, skipped, invalid, warnings });
      await log(null, "CSV import", `Imported ${added} case(s), skipped ${skipped} duplicate(s)${invalid ? `, rejected ${invalid}` : ""} from ${file.name}`, "integration");
    } catch (e) {
      notify(`CSV import failed: ${errorMessage(e)}`, "warn");
    } finally {
      setImporting(false);
    }
  };

  const exportCSV = () => {
    downloadCSV("caseclarity-cases-export.csv", toCSV(
      ["Case Number", "Title", "Client", "Type", "Status", "Priority", "Assigned To", "Completeness %", "Created"],
      cases.map(c => [c.caseNumber, c.title, c.clientName, c.caseType, c.status, c.priority, c.assignedTo, c.completeness ?? 0, c.createdAt.slice(0, 10)]),
    ));
    setExported(true);
    log(null, "CSV export", `Exported ${cases.length} cases to CSV`, "integration");
  };

  const importDrive = async (name: string) => {
    if (!targetCase) { notify("Choose the case to import into first.", "warn"); return; }
    setDriveBusy(name);
    try {
      await addDoc({ caseId: targetCase.id, name, type: "PDF", size: 120000, status: "processed", extractedText: `Imported from Google Drive (simulated): ${name}. No real file content — this is a placeholder for the demo.`, pageCount: 1, source: DRIVE_SOURCE });
      await log(targetCase.id, "Document imported", `${name} via Google Drive (simulated) into ${targetCase.caseNumber}`, "integration");
      notify(`${name} imported into ${targetCase.caseNumber} (simulated).`);
    } catch (e) {
      notify(`Import failed: ${errorMessage(e)}`, "warn");
    } finally {
      setDriveBusy(null);
    }
  };

  const sampleCSV = () => {
    downloadCSV("sample-import.csv", toCSV(
      ["client_name", "title", "case_type", "priority", "status", "date"],
      [
        ["Sarah Miller", "Eviction Defense — Notice Review", "Housing / Eviction", "high", "awaiting_review", "05/01/2026"],
        ["Tom Baker", "Benefits Appeal — Denial", "Benefits Appeal", "urgent", "missing documents", "2026-05-02"],
        ["Sarah Miller", "Eviction Defense — Notice Review", "Housing / Eviction", "high", "", "05/01/2026"],
      ],
    ));
  };

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0f2043]">Integrations</h1>
        <p className="mt-0.5 text-sm text-slate-500">Connect existing systems without assuming clean APIs. Simulated integrations are clearly labeled.</p>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span><b>Google Drive is simulated</b> — no live connection and no real file content. <b>CSV import/export is live</b> and writes to the database.</span>
      </div>

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
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Browse shared Drive files and import them into a case. In production, this would use the Drive API with OAuth. Here it is a clearly labeled simulation.</p>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Import into case</span>
            <select value={driveCaseId} onChange={e => setDriveCaseId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-blue-500">
              <option value="">Select a case…</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber} — {c.clientName}</option>)}
            </select>
          </label>
          <div className="mt-3 space-y-2">
            {DRIVE_FILES.map(f => {
              const done = driveImported.has(f.name);
              return (
                <div key={f.name} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <FileSpreadsheet size={16} className="shrink-0 text-blue-600" />
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold text-slate-800">{f.name}</div><div className="text-[10px] text-slate-400">{f.size} · Modified {f.modified} · {f.shared ? "Shared with you" : "Not shared"}</div></div>
                  <Btn variant={done ? "secondary" : "primary"} onClick={() => importDrive(f.name)} disabled={done || !targetCase || driveBusy !== null}>
                    {done ? <><CheckCircle2 size={13} /> Imported</> : driveBusy === f.name ? <Loader2 size={13} className="animate-spin" /> : "Import"}
                  </Btn>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400"><RefreshCw size={12} /> Last import: {lastDriveImport ? fmtTime(lastDriveImport) : "never"} (simulated). Imports are audit-logged.</div>
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
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Import cases from any CSV system. Missing columns, mixed date formats, unknown values and duplicates are detected and reported — never silently dropped.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn onClick={() => csvRef.current?.click()} disabled={importing}>{importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Import CSV</Btn>
            <Btn variant="secondary" onClick={exportCSV}><Download size={15} /> Export Cases CSV</Btn>
            <Btn variant="ghost" onClick={sampleCSV}>Download sample CSV</Btn>
            <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCSV(f); e.target.value = ""; }} />
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
          <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-400"><XCircle size={12} className="mt-0.5 shrink-0" /> Recognised columns: client_name, title, case_type, priority, status, date, description, assigned_to. Unknown columns are ignored safely.</div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#0f2043]"><Plug size={15} /> Integration Principles</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[{ t: "Never pretend a connection is live", d: "Simulated integrations are labeled 'Simulated'." }, { t: "Report, don't silently drop", d: "Duplicates, missing columns, unknown values and bad dates produce a visible import report." }, { t: "Audit every import/export", d: "Each transfer is written to the audit trail with actor and timestamp." }].map(x => (
            <div key={x.t} className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-extrabold text-slate-800">{x.t}</div><div className="mt-1 text-[11px] leading-relaxed text-slate-500">{x.d}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
