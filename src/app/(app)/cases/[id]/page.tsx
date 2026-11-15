"use client";
import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, UploadCloud, Sparkles, CheckCircle2, XCircle, Pencil, MessageSquare, Flag, FilePlus, ShieldCheck, AlertTriangle, Clock, History, BrainCircuit, Loader2, Trash2, Download, Eye } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, Badge, StatusBadge, ConfidenceBar, DemoBanner, SafetyBanner, EmptyState, Btn, PriorityDot } from "@/components/ui";
import { runAnalysis, fmtDate, fmtTime, fmtSize, uid, REQUIRED_DOCS } from "@/lib/core";

type Tab = "overview" | "documents" | "analysis" | "recommendation" | "review" | "audit";

export default function CaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { cases, docs, extractions, recs, audit, addDoc, replaceCaseExtractions, addRec, updateRec, updateCase, log, user, notify } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [modifiedText, setModifiedText] = useState("");
  const [editing, setEditing] = useState(false);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const c = cases.find(x => x.id === id);
  const caseDocs = useMemo(() => docs.filter(d => d.caseId === id), [docs, id]);
  const caseEx = useMemo(() => extractions.filter(e => e.caseId === id), [extractions, id]);
  const caseRec = useMemo(() => recs.filter(r => r.caseId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [recs, id]);
  const caseAudit = useMemo(() => audit.filter(a => a.caseId === id), [audit, id]);

  if (!c) return <div className="py-20 text-center"><p className="text-sm text-slate-500">Case not found.</p><Link href="/cases" className="mt-3 inline-block text-sm font-bold text-[#2563eb]">Back to cases</Link></div>;

  const required = REQUIRED_DOCS[c.caseType] || REQUIRED_DOCS["Other"];
  const presentNames = caseDocs.map(d => d.name.toLowerCase()).join(" ");
  const missing = required.filter(r => !presentNames.includes(r.toLowerCase().split(" ")[0]));

  // Real server-side extraction: the file is sent to /api/extract, which
  // parses PDF (PDF.js) and DOCX (mammoth) for real. No client-side simulation.
  const handleFiles = async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const res = await fetch("/api/extract", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) { notify(`Extraction failed for ${f.name}: ${data.error || "unknown error"}`, "warn"); continue; }
        const doc = {
          id: uid(), caseId: id, name: f.name, type: data.type || "FILE", size: f.size,
          status: "processed" as const,
          extractedText: data.text || `No extractable text found in ${f.name}.`,
          pageCount: data.pageCount || 1, uploadedAt: new Date().toISOString(), source: "Upload",
        };
        await addDoc(doc);
        log(id, "Document uploaded", `${f.name} (${fmtSize(f.size)}) — ${data.pageCount} page(s), ${(data.text || "").length} chars extracted${data.warning ? " (" + data.warning + ")" : ""}`, "document");
        notify(`${f.name} uploaded — text extracted (${data.pageCount} page(s)).`);
      } catch {
        notify(`Upload failed for ${f.name}.`, "warn");
      }
    }
  };

  // Analysis flow: try the real LLM backend (/api/analyze) first. If no
  // LLM_API_KEY is configured, the endpoint reports mode "demo" and we fall
  // back to the local demo engine — clearly labeled in the audit trail.
  const runAI = async () => {
    setAnalyzing(true);
    log(id, "AI analysis started", "Analysis requested (LLM backend if configured, else Demo Mode)", "ai");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: caseDocs.map((d) => `--- ${d.name} ---\n${d.extractedText}`).join("\n\n") }),
      });
      const data = await res.json();
      if (data.mode === "llm" && data.result) {
        const r = data.result;
        const exs = (r.facts || []).map((f: { field: string; value: string; confidence: number; sourceDoc: string; sourcePage: number; snippet: string; category: string }) => ({
          id: uid(), caseId: id,
          documentId: caseDocs.find((d) => d.name === f.sourceDoc)?.id || caseDocs[0]?.id || "",
          fieldName: f.field, fieldValue: f.value, confidence: f.confidence || 80,
          sourceDoc: f.sourceDoc, sourcePage: f.sourcePage || 1, sourceSnippet: f.snippet || "", category: f.category || "fact",
        }));
        await replaceCaseExtractions(id, exs);
        await addRec({
          id: uid(), caseId: id, title: r.recommendation.title, summary: r.recommendation.summary,
          reasoning: r.recommendation.reasoning, confidence: r.recommendation.confidence || 70,
          status: "pending", evidence: r.recommendation.evidence || [], missingInfo: r.recommendation.missingInfo || [],
          uncertainties: r.recommendation.uncertainties || [], nextSteps: r.recommendation.nextSteps || [],
          createdAt: new Date().toISOString(),
        });
        const newCompleteness = Math.max(5, Math.min(100, Math.round((caseDocs.length / Math.max(1, required.length)) * 100)));
        updateCase(id, { completeness: newCompleteness });
        log(id, "AI analysis completed (LLM)", `Model ${data.model || "unknown"}: ${exs.length} facts extracted. Recommendation: ${r.recommendation.title} (confidence ${r.recommendation.confidence}, uncalibrated heuristic)`, "ai");
        notify("LLM analysis complete — review the recommendation.");
        setTab("recommendation");
        return;
      }
      throw new Error(data.error || "demo fallback");
    } catch {
      const result = runAnalysis(c, caseDocs);
      await replaceCaseExtractions(id, result.extractions);
      await addRec(result.recommendation);
      const newCompleteness = Math.max(5, Math.min(100, Math.round((caseDocs.length / Math.max(1, required.length)) * 100)));
      updateCase(id, { completeness: newCompleteness, status: missing.length >= 3 ? "missing_docs" : result.contradictions.length ? "flagged" : "awaiting_review" });
      log(id, "AI analysis completed (Demo Mode)", `${result.summary} Recommendation: ${result.recommendation.title} (confidence ${result.recommendation.confidence}, demo uncalibrated)`, "ai");
      setTab("recommendation");
    } finally {
      setAnalyzing(false);
    }
  };

  const review = (action: "approved" | "rejected" | "modified") => {
    if (!caseRec) return;
    if (action === "modified" && !modifiedText.trim()) { notify("Write the modified recommendation text first.", "warn"); return; }
    const comment = reviewComment.trim() || (action === "approved" ? "Approved by case worker." : action === "rejected" ? "Rejected — see comment." : "Modified by case worker.");
    if (action === "modified" && modifiedText.trim()) {
      updateRec(caseRec.id, { status: "modified", summary: modifiedText.trim(), reviewedBy: user?.name, reviewComment: comment });
      log(id, "Recommendation modified", `Modified: "${modifiedText.trim().slice(0, 120)}" — ${comment}`, "review");
    } else {
      updateRec(caseRec.id, { status: action, reviewedBy: user?.name, reviewComment: comment });
      log(id, `Recommendation ${action}`, comment, "review");
    }
    if (action === "approved") updateCase(id, { status: "completed" });
    notify(action === "approved" ? "Recommendation approved and recorded in the audit trail." : action === "rejected" ? "Recommendation rejected and recorded in the audit trail." : "Modification saved and recorded in the audit trail.");
    setReviewComment(""); setModifiedText(""); setEditing(false);
  };

  const tabs: { key: Tab; label: string; badge?: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "documents", label: `Documents (${caseDocs.length})` },
    { key: "analysis", label: `Analysis (${caseEx.length})` },
    { key: "recommendation", label: "Recommendation", badge: caseRec ? caseRec.status : undefined },
    { key: "review", label: "Human Review" },
    { key: "audit", label: `Audit (${caseAudit.length})` },
  ];

  return (
    <div className="space-y-5 animate-fadeUp">
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#0f2043]"><ArrowLeft size={13} /> All cases</Link>

      {/* Header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="navy">{c.caseNumber}</Badge>
              <StatusBadge status={c.status} />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400"><PriorityDot p={c.priority} /> {c.priority} priority</span>
            </div>
            <h1 className="mt-2 text-xl font-extrabold leading-snug text-[#0f2043] sm:text-2xl">{c.title}</h1>
            <div className="mt-1 text-sm font-semibold text-slate-500">{c.clientName} · {c.caseType} · Assigned to {c.assignedTo}</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{c.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Completeness</div>
              <div className="text-2xl font-extrabold text-[#0f2043]">{c.completeness}%</div>
            </div>
            <div className="w-36 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.completeness >= 80 ? "bg-emerald-500" : c.completeness >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${c.completeness}%` }} /></div>
            <div className="text-[11px] text-slate-400">Created {fmtDate(c.createdAt)} · Updated {fmtDate(c.updatedAt)}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Btn onClick={runAI} disabled={analyzing || caseDocs.length === 0}>
            {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {analyzing ? "Analyzing…" : "Run AI Analysis (Demo Mode)"}
          </Btn>
          <Btn variant="secondary" onClick={() => fileRef.current?.click()}><UploadCloud size={15} /> Upload Documents</Btn>
          <Btn variant="secondary" onClick={() => { log(id, "Additional documents requested", "Case worker requested more documents from client", "review"); notify("Document request logged in the audit trail."); }}><FilePlus size={15} /> Request Documents</Btn>
          <Btn variant="ghost" onClick={() => { updateCase(id, { status: "flagged" }); log(id, "Case flagged for investigation", "Marked for further investigation by case worker", "review"); }}><Flag size={15} /> Flag for Investigation</Btn>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv,.md" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 scrollbar-thin">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === t.key ? "bg-[#0f2043] text-white shadow" : "text-slate-500 hover:bg-slate-100"}`}>
            {t.label}
            {t.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${tab === t.key ? "bg-white/20" : "bg-amber-100 text-amber-700"}`}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <h2 className="text-sm font-extrabold text-[#0f2043]">Case Summary</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.description}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[{ k: "Documents", v: String(caseDocs.length) }, { k: "Facts Extracted", v: String(caseEx.length) }, { k: "Audit Events", v: String(caseAudit.length) }].map(s => (
                <div key={s.k} className="rounded-xl bg-slate-50 p-3 text-center"><div className="text-xl font-extrabold text-[#0f2043]">{s.v}</div><div className="text-[11px] font-semibold text-slate-400">{s.k}</div></div>
              ))}
            </div>
            {caseRec && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Latest AI Recommendation</span>
                  <StatusBadge status={caseRec.status} />
                </div>
                <div className="mt-1 text-sm font-extrabold text-[#0f2043]">{caseRec.title}</div>
                <div className="mt-1 text-xs text-slate-600">{caseRec.summary}</div>
                <button onClick={() => setTab("recommendation")} className="mt-2 text-xs font-bold text-[#2563eb] hover:underline">View full explanation →</button>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-[#0f2043]">Required Documents Checklist</h2>
            <div className="mt-3 space-y-2">
              {required.map(r => {
                const has = presentNames.includes(r.toLowerCase().split(" ")[0]);
                return (
                  <div key={r} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold ${has ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                    {has ? <CheckCircle2 size={15} /> : <XCircle size={15} />}{r}
                    <span className="ml-auto text-[10px] font-extrabold uppercase">{has ? "Present" : "Missing"}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4"><SafetyBanner /></div>
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-4">
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }} onClick={() => fileRef.current?.click()} className={`cursor-pointer rounded-3xl border-2 border-dashed p-8 text-center transition ${dragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-400"}`}>
            <UploadCloud size={32} className="mx-auto text-blue-500" />
            <div className="mt-2 text-sm font-extrabold text-slate-800">Drag & drop PDF, DOCX, TXT or CSV files here</div>
            <div className="mt-1 text-xs text-slate-400">or click to browse · Text is extracted automatically · Demo Mode parsing for binary files</div>
          </div>
          {caseDocs.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No documents yet" desc="Upload at least one document, then run AI Analysis to extract facts and generate a recommendation." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {caseDocs.map(d => (
                <Card key={d.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold text-slate-800">{d.name}</div>
                      <div className="text-[11px] text-slate-400">{d.type} · {fmtSize(d.size)} · {d.pageCount} page(s) · {d.source} · {fmtDate(d.uploadedAt)}</div>
                      <div className="mt-1.5"><StatusBadge status={d.status} /></div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setViewDoc(viewDoc === d.id ? null : d.id)} title="View extracted text" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Eye size={15} /></button>
                      <button onClick={() => { const blob = new Blob([d.extractedText], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = d.name.replace(/\.[^.]+$/, "") + "_extracted.txt"; a.click(); URL.revokeObjectURL(url); }} title="Download extracted text" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Download size={15} /></button>
                    </div>
                  </div>
                  {viewDoc === d.id && <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 scrollbar-thin">{d.extractedText}</div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "analysis" && (
        <div className="space-y-4">
          <DemoBanner />
          {caseEx.length === 0 ? (
            <EmptyState icon={<BrainCircuit size={22} />} title="No analysis yet" desc="Click 'Run AI Analysis' to extract facts with source citations, detect contradictions and identify missing information." action={<Btn onClick={runAI} disabled={caseDocs.length === 0}><Sparkles size={15} /> Run AI Analysis</Btn>} />
          ) : (
            <>
              <Card className="p-5">
                <h2 className="text-sm font-extrabold text-[#0f2043]">Extracted Facts ({caseEx.length})</h2>
                <p className="mt-0.5 text-xs text-slate-400">Every fact is cited to its source document and page. Verify against originals before relying on them.</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead><tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2 pr-3">Field</th><th className="pb-2 pr-3">Value</th><th className="pb-2 pr-3">Source</th><th className="pb-2 pr-3">Confidence</th><th className="pb-2">Snippet</th></tr></thead>
                    <tbody>
                      {caseEx.map(e => (
                        <tr key={e.id} className="border-b border-slate-100 align-top">
                          <td className="py-2.5 pr-3 font-bold text-slate-700">{e.fieldName}</td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-800">{e.fieldValue}</td>
                          <td className="py-2.5 pr-3 text-slate-500">{e.sourceDoc} · p.{e.sourcePage}</td>
                          <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${e.confidence >= 90 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{e.confidence}%</span></td>
                          <td className="max-w-[220px] py-2.5 text-slate-500">“{e.sourceSnippet}”</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-rose-700"><AlertTriangle size={15} /> Missing Information ({missing.length})</h3>
                  {missing.length === 0 ? <p className="mt-2 text-xs text-slate-500">No required documents missing. All checklist items are present.</p> : <ul className="mt-2 space-y-1.5 text-xs text-slate-600">{missing.map(m => <li key={m} className="flex gap-2"><XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />{m}</li>)}</ul>}
                </Card>
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-violet-700"><AlertTriangle size={15} /> Contradictions Detected</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">Demo engine checks for conflicting monetary figures and timeline inconsistencies. See the recommendation for details.</p>
                  {caseRec && caseRec.uncertainties.length > 0 && <ul className="mt-2 space-y-1.5 text-xs text-slate-600">{caseRec.uncertainties.map((u, i) => <li key={i} className="flex gap-2"><Clock size={13} className="mt-0.5 shrink-0 text-amber-500" />{u}</li>)}</ul>}
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "recommendation" && (
        <div className="space-y-4">
          {!caseRec ? (
            <EmptyState icon={<Sparkles size={22} />} title="No recommendation yet" desc="Run AI Analysis to generate an explainable recommendation with evidence, confidence and uncertainties." action={<Btn onClick={runAI} disabled={caseDocs.length === 0}><Sparkles size={15} /> Run AI Analysis</Btn>} />
          ) : (
            <>
              <DemoBanner />
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 bg-gradient-to-r from-[#0f2043] to-[#1e3a5f] p-5 text-white sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-300">AI Recommendation · Demo Mode</div>
                      <h2 className="mt-1 text-lg font-extrabold leading-snug sm:text-xl">{caseRec.title}</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-300">{caseRec.summary}</p>
                    </div>
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-center backdrop-blur">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-blue-200">Confidence (uncalibrated)</div>
                      <div className="text-2xl font-extrabold">{caseRec.confidence}%</div>
                      <div className="text-[10px] text-blue-200">{caseRec.confidence >= 85 ? "High" : caseRec.confidence >= 70 ? "Moderate" : "Low"} · heuristic only</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <StatusBadge status={caseRec.status} />
                    <span className="text-[11px] text-slate-300">Generated {fmtTime(caseRec.createdAt)} · Requires human approval</span>
                  </div>
                </div>
                <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Why the AI generated this</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{caseRec.reasoning}</p>
                    <h3 className="mt-5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Supporting Evidence</h3>
                    <div className="mt-2 space-y-2">
                      {caseRec.evidence.map((ev, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-xs font-bold text-slate-800">{ev.claim}</div>
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-blue-700"><FileText size={12} /> {ev.doc} · Page {ev.page}</div>
                          <div className="mt-1 text-[11px] italic leading-relaxed text-slate-500">“{ev.snippet}”</div>
                        </div>
                      ))}
                      {caseRec.evidence.length === 0 && <p className="text-xs text-slate-400">No evidence cited — treat this recommendation with extra caution.</p>}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Missing Information</h3>
                    {caseRec.missingInfo.length === 0 ? <p className="mt-2 text-xs text-emerald-700">None — all required items present.</p> : <ul className="mt-2 space-y-1.5 text-xs text-slate-700">{caseRec.missingInfo.map(m => <li key={m} className="flex gap-2"><XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />{m}</li>)}</ul>}
                    <h3 className="mt-5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Uncertainties & Possible Exceptions</h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700">{caseRec.uncertainties.map((u, i) => <li key={i} className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />{u}</li>)}</ul>
                    <h3 className="mt-5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Suggested Next Steps</h3>
                    <ol className="mt-2 space-y-1.5 text-xs text-slate-700">{caseRec.nextSteps.map((s, i) => <li key={i} className="flex gap-2"><span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[#0f2043] text-[9px] font-extrabold text-white">{i + 1}</span>{s}</li>)}</ol>
                    {caseRec.reviewedBy && (
                      <div className="mt-5 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
                        <b>Reviewed by {caseRec.reviewedBy}</b> — {caseRec.reviewComment}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="text-sm font-extrabold text-[#0f2043]">Human Review</h3>
                <p className="mt-0.5 text-xs text-slate-500">Your decision is recorded in the audit trail. The AI recommendation is advisory only.</p>
                <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} rows={2} placeholder="Add a comment (optional) — e.g. 'Verified against originals. Proceeding.'" className="mt-3 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                {editing && <textarea value={modifiedText} onChange={e => setModifiedText(e.target.value)} rows={2} placeholder="Modified recommendation text…" className="mt-2 w-full rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500" />}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn variant="success" onClick={() => review("approved")}><CheckCircle2 size={15} /> Approve</Btn>
                  <Btn variant="secondary" onClick={() => setEditing(!editing)}><Pencil size={15} /> Modify</Btn>
                  {editing && <Btn onClick={() => review("modified")}><CheckCircle2 size={15} /> Save Modification</Btn>}
                  <Btn variant="danger" onClick={() => review("rejected")}><XCircle size={15} /> Reject</Btn>
                  <Btn variant="ghost" onClick={() => { log(id, "Additional documents requested", "Requested via recommendation panel", "review"); notify("Document request logged in the audit trail."); }}><MessageSquare size={15} /> Request Documents</Btn>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-[#0f2043]">Review History</h2>
            {caseAudit.filter(a => a.category === "review").length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No human review actions yet. Approve, reject or modify the recommendation to create a review record.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {caseAudit.filter(a => a.category === "review").map(a => (
                  <div key={a.id} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div><div className="text-xs font-extrabold text-slate-800">{a.action} <span className="font-semibold text-slate-400">· {a.actor}</span></div><div className="text-xs text-slate-600">{a.details}</div><div className="text-[10px] text-slate-400">{fmtTime(a.timestamp)}</div></div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <SafetyBanner />
        </div>
      )}

      {tab === "audit" && (
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#0f2043]"><History size={15} /> Audit Trail — {c.caseNumber}</h2>
          <p className="mt-0.5 text-xs text-slate-400">Every upload, analysis, extraction, recommendation and human action with date & time.</p>
          <div className="relative mt-5 space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
            {caseAudit.map(a => (
              <div key={a.id} className="relative flex gap-4 pl-1">
                <div className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-white text-white ${a.category === "ai" ? "bg-violet-500" : a.category === "document" ? "bg-blue-500" : a.category === "review" ? "bg-emerald-500" : "bg-slate-400"}`}>
                  {a.category === "ai" ? <Sparkles size={13} /> : a.category === "document" ? <FileText size={13} /> : a.category === "review" ? <ShieldCheck size={13} /> : <Clock size={13} />}
                </div>
                <div className="min-w-0 flex-1 rounded-xl bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-800">{a.action}<Badge tone="slate">{a.category}</Badge><span className="ml-auto text-[10px] font-semibold text-slate-400">{fmtTime(a.timestamp)}</span></div>
                  <div className="mt-0.5 text-xs text-slate-600">{a.details}</div>
                  <div className="text-[10px] text-slate-400">by {a.actor}</div>
                </div>
              </div>
            ))}
            {caseAudit.length === 0 && <p className="pl-10 text-xs text-slate-400">No audit events yet for this case.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
