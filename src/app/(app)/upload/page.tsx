"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight, FolderOpen, XCircle } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { Card, Badge, StatusBadge, EmptyState, Btn } from "@/components/ui";
import { fmtSize, fmtDate, uid, checkRequiredDocs } from "@/lib/core";

export default function UploadPage() {
  const { cases, docs, addDoc, updateCase, extractFile, log, notify } = useStore();
  const [caseId, setCaseId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<{ key: string; name: string; size: number; status: "processing" | "processed" | "failed"; note?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Real server-side extraction via /api/extract (PDF.js for PDF, mammoth for DOCX).
  const handleFiles = async (files: FileList | File[]) => {
    if (!caseId) { notify("Select a destination case before uploading.", "warn"); return; }
    const target = cases.find(c => c.id === caseId);
    const list = Array.from(files).map(f => ({ f, key: uid() }));
    setQueue(q => [...q, ...list.map(({ f, key }) => ({ key, name: f.name, size: f.size, status: "processing" as const }))]);
    const added: { name: string; extractedText: string }[] = [];
    for (const { f, key } of list) {
      const mark = (status: "processed" | "failed", note?: string) => setQueue(q => q.map(x => x.key === key ? { ...x, status, note } : x));
      try {
        const data = await extractFile(f);
        await addDoc({ caseId, name: f.name, type: data.type || "FILE", size: f.size, status: "processed", extractedText: data.text || "", pageCount: data.pageCount || 1, source: "Upload" });
        added.push({ name: f.name, extractedText: data.text || "" });
        mark("processed", data.warning);
        await log(caseId, "Document uploaded", `${f.name} (${fmtSize(f.size)}) via Upload page — ${data.pageCount} page(s)${data.pagesEstimated ? " (estimated)" : ""}, ${(data.text || "").length} chars extracted`, "document");
      } catch (e) {
        mark("failed", errorMessage(e));
        notify(`Upload failed for ${f.name}: ${errorMessage(e)}`, "warn");
      }
    }
    if (target && added.length) {
      const existing = docs.filter(d => d.caseId === caseId);
      const completeness = checkRequiredDocs(target.caseType, [...existing, ...added]).completeness;
      if (completeness !== target.completeness) await updateCase(caseId, { completeness }).catch(() => {});
    }
  };

  const recent = [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)).slice(0, 8);

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0f2043]">Upload Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500">Upload PDF, DOCX, TXT or CSV files. Text is extracted and processing status is tracked per file.</p>
      </div>

      <Card className="p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Destination case</span>
          <select value={caseId} onChange={e => setCaseId(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500">
            <option value="">Select a case…</option>
            {cases.map(c => <option key={c.id} value={c.id}>{c.caseNumber} — {c.clientName} ({c.title.slice(0, 40)}…)</option>)}
          </select>
        </label>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()} className={`mt-4 cursor-pointer rounded-3xl border-2 border-dashed p-10 text-center transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400"}`}>
          <UploadCloud size={36} className="mx-auto text-blue-500" />
          <div className="mt-2 text-sm font-extrabold text-slate-800">Drag & drop files here, or click to browse</div>
          <div className="mt-1 text-xs text-slate-400">PDF · DOCX · TXT · CSV — up to 10 MB each · text is extracted on the server</div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv,.md" className="hidden" onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {queue.length > 0 && (
          <div className="mt-4 space-y-2">
            {queue.map(q => (
              <div key={q.key} className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 text-xs ${q.status === "failed" ? "bg-rose-50" : "bg-slate-50"}`}>
                {q.status === "processing" ? <Loader2 size={15} className="animate-spin text-blue-600" /> : q.status === "failed" ? <XCircle size={15} className="text-rose-600" /> : <CheckCircle2 size={15} className="text-emerald-600" />}
                <span className="font-bold text-slate-700">{q.name}</span>
                <span className="text-slate-400">{fmtSize(q.size)}</span>
                <span className="ml-auto"><Badge tone={q.status === "processing" ? "blue" : q.status === "failed" ? "red" : "green"}>{q.status}</Badge></span>
                {q.note && <span className={`w-full text-[11px] ${q.status === "failed" ? "text-rose-700" : "text-amber-700"}`}>{q.note}</span>}
              </div>
            ))}
          </div>
        )}
        {caseId && <div className="mt-4"><Link href={`/cases/${caseId}`}><Btn>Open case & run analysis <ArrowRight size={15} /></Btn></Link></div>}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-extrabold text-[#0f2043]">Recently Uploaded</h2>
        {recent.length === 0 ? <div className="mt-3"><EmptyState icon={<FolderOpen size={22} />} title="No documents uploaded yet" desc="Upload your first document above." /></div> : (
          <div className="mt-3 divide-y divide-slate-100">
            {recent.map(d => {
              const c = cases.find(x => x.id === d.caseId);
              return (
                <div key={d.id} className="flex items-center gap-3 py-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">{d.name}</div>
                    <div className="text-[11px] text-slate-400">{c?.caseNumber || "—"} · {fmtSize(d.size)} · {d.pageCount} page(s) · {fmtDate(d.uploadedAt)}</div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
