"use client";
import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText, UploadCloud, Sparkles, CheckCircle2, XCircle, Pencil, MessageSquare, Flag, FilePlus, ShieldCheck, AlertTriangle, Clock, History, BrainCircuit, Loader2, Download, Eye, Lock, Trash2 } from "lucide-react";
import { useStore, errorMessage } from "@/lib/store";
import { Card, Badge, StatusBadge, AiModeBanner, EngineBadge, SafetyBanner, EmptyState, Btn, PriorityDot } from "@/components/ui";
import { runAnalysis, checkRequiredDocs, suggestStatus, fmtDate, fmtTime, fmtSize, uid, Extraction, CaseStatus } from "@/lib/core";

type Tab = "overview" | "documents" | "analysis" | "recommendation" | "review" | "audit";

function UnverifiedBadge() {
  return <span title="The AI cited a document or quote that could not be found in this case file" className="ml-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700"><AlertTriangle size={10} /> Unverified</span>;
}

export default function CaseDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { cases, docs, extractions, recs, audit, config, isManager, addDoc, replaceCaseExtractions, addRec, reviewRec, updateCase, deleteCase, extractFile, analyze, log, notify } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [modifiedText, setModifiedText] = useState("");
  const [editing, setEditing] = useState(false);
  const [viewDoc, setViewDoc] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const c = cases.find(x => x.id === id);
  const caseDocs = useMemo(() => docs.filter(d => d.caseId === id), [docs, id]);
  const caseEx = useMemo(() => extractions.filter(e => e.caseId === id), [extractions, id]);
  const caseRec = useMemo(() => recs.filter(r => r.caseId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [recs, id]);
  const caseAudit = useMemo(() => audit.filter(a => a.caseId === id), [audit, id]);
  const checklist = useMemo(() => checkRequiredDocs(c?.caseType || "Other", caseDocs), [c?.caseType, caseDocs]);

  if (!c) return <div className="py-20 text-center"><p className="text-sm text-slate-500">Case not found.</p><Link href="/cases" className="mt-3 inline-block text-sm font-bold text-[#2563eb]">Back to cases</Link></div>;

  const missing = checklist.missing;
  const completeness = c.completeness ?? 0;
  const recLocked = caseRec?.status === "approved" || caseRec?.status === "rejected";
  const modeLabel = config.aiMode === "llm" ? "Live AI" : "Demo Mode";

  // Real server-side extraction (PDF.js / mammoth), then the document is saved
  // and the case's completeness is recalculated from the checklist.
  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    setUploading(n => n + list.length);
    const added: { name: string; extractedText: string }[] = [];
    for (const f of list) {
      try {
        const data = await extractFile(f);
        await addDoc({
          caseId: id, name: f.name, type: data.type || "FILE", size: f.size, status: "processed",
          extractedText: data.text || "", pageCount: data.pageCount || 1, source: "Upload",
        });
        added.push({ name: f.name, extractedText: data.text || "" });
        await log(id, "Document uploaded", `${f.name} (${fmtSize(f.size)}) — ${data.pageCount} page(s)${data.pagesEstimated ? " (estimated)" : ""}, ${(data.text || "").length} chars extracted${data.warning ? " (" + data.warning + ")" : ""}`, "document");
        notify(data.warning ? `${f.name} uploaded — ${data.warning}` : `${f.name} uploaded — text extracted (${data.pageCount} page(s)).`, data.warning ? "warn" : "ok");
      } catch (e) {
        notify(`Upload failed for ${f.name}: ${errorMessage(e)}`, "warn");
      } finally {
        setUploading(n => n - 1);
      }
    }
    if (added.length) {
      const next = checkRequiredDocs(c.caseType, [...caseDocs, ...added]).completeness;
      if (next !== completeness) await updateCase(id, { completeness: next }).catch(e => notify(`Could not update completeness: ${errorMessage(e)}`, "warn"));
    }
  };

  // Analysis: the server runs the real LLM when a key is configured and
  // verifies its citations. Otherwise it answers "demo" with a reason, and the
  // deterministic demo engine runs here. Both paths are labelled in the audit.
  const runAI = async () => {
    setAnalyzing(true);
    try {
      await log(id, "AI analysis started", `Analysis requested (${config.aiMode === "llm" ? "LLM backend" : "Demo Mode"})`, "ai");
      let fallbackReason = "";
      try {
        const data = await analyze(id);
        if (data.mode === "llm") {
          const r = data.result;
          const exs: Extraction[] = r.facts.map(f => ({ id: uid(), caseId: id, ...f }));
          await replaceCaseExtractions(id, exs);
          await addRec({
            id: uid(), caseId: id, ...r.recommendation, contradictions: r.contradictions,
            status: "pending", engine: "llm", createdAt: new Date().toISOString(),
          });
          await applyCaseUpdate(suggestStatus(missing.length, r.contradictions.length));
          await log(id, "AI analysis completed (LLM)", `Model ${data.model}: ${exs.length} facts extracted${r.unverifiedCount ? `, ${r.unverifiedCount} unverified citation(s)` : ""}. Recommendation: ${r.recommendation.title} (confidence ${r.recommendation.confidence}, uncalibrated heuristic)`, "ai");
          notify(r.unverifiedCount ? `Analysis complete — ${r.unverifiedCount} citation(s) could not be verified. Check them before relying on them.` : "LLM analysis complete — review the recommendation.", r.unverifiedCount ? "warn" : "ok");
          setTab("recommendation");
          return;
        }
        fallbackReason = data.reason;
      } catch (e) {
        fallbackReason = `Analysis service unavailable (${errorMessage(e)})`;
      }

      const result = runAnalysis(c, caseDocs);
      await replaceCaseExtractions(id, result.extractions);
      await addRec(result.recommendation);
      await applyCaseUpdate(result.suggestedStatus);
      await log(id, "AI analysis completed (Demo Mode)", `${fallbackReason ? fallbackReason + " " : ""}${result.summary} Recommendation: ${result.recommendation.title} (confidence ${result.recommendation.confidence}, demo uncalibrated)`, "ai");
      notify("Analysis complete — review the recommendation.");
      setTab("recommendation");
    } catch (e) {
      notify(`Analysis could not be saved: ${errorMessage(e)}`, "warn");
      await log(id, "AI analysis failed", errorMessage(e), "ai");
    } finally {
      setAnalyzing(false);
    }
  };

  // A completed (closed) case keeps its status when it is re-analysed.
  const applyCaseUpdate = async (status: CaseStatus) => {
    await updateCase(id, c.status === "completed" ? { completeness: checklist.completeness } : { completeness: checklist.completeness, status });
  };

  const review = async (action: "approved" | "rejected" | "modified") => {
    if (!caseRec || recLocked || reviewing) return;
    if (action === "modified" && !modifiedText.trim()) { notify("Write the modified recommendation text first.", "warn"); return; }
    const comment = reviewComment.trim() || (action === "approved" ? "Approved by case worker." : action === "rejected" ? "Rejected — see comment." : "Modified by case worker.");
    setReviewing(true);
    try {
      await reviewRec(caseRec.id, action === "modified" ? { status: "modified", summary: modifiedText.trim(), reviewComment: comment } : { status: action, reviewComment: comment });
      if (action === "modified") await log(id, "Recommendation modified", `Modified: "${modifiedText.trim().slice(0, 120)}" — ${comment}`, "review");
      else await log(id, `Recommendation ${action}`, comment, "review");
      if (action === "approved") await updateCase(id, { status: "completed" });
      notify(action === "approved" ? "Recommendation approved and recorded in the audit trail." : action === "rejected" ? "Recommendation rejected and recorded in the audit trail." : "Modification saved and recorded in the audit trail.");
      setReviewComment(""); setModifiedText(""); setEditing(false);
    } catch (e) {
      notify(`Review was NOT saved: ${errorMessage(e)}`, "warn");
    } finally {
      setReviewing(false);
    }
  };

  const flag = async () => {
    try {
      await updateCase(id, { status: "flagged" });
      await log(id, "Case flagged for investigation", "Marked for further investigation by case worker", "review");
      notify("Case flagged for investigation.");
    } catch (e) { notify(`Could not flag the case: ${errorMessage(e)}`, "warn"); }
  };

  const requestDocs = async (where: string) => {
    await log(id, "Additional documents requested", missing.length ? `${where}: ${missing.join(", ")}` : where, "review");
    notify("Document request logged in the audit trail.");
  };

  const removeCase = async () => {
    // Two-click confirmation (no window.confirm: sandboxed previews block it).
    if (!confirmDelete) {
      setConfirmDelete(true);
      notify(`Click "Confirm delete" to remove ${c.caseNumber} with its documents, facts and recommendations. The audit history is kept.`, "warn");
      setTimeout(() => setConfirmDelete(false), 6000);
      return;
    }
    try {
      await deleteCase(id);
      notify(`${c.caseNumber} deleted.`);
      router.push("/cases");
    } catch (e) { notify(`Could not delete the case: ${errorMessage(e)}`, "warn"); }
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
            <div className="mt-1 text-sm font-semibold text-slate-500">{c.clientName} · {c.caseType} · Assigned to {c.assignedTo || "—"}</div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{c.description}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Completeness</div>
              <div className="text-2xl font-extrabold text-[#0f2043]">{completeness}%</div>
            </div>
            <div className="h-2 w-36 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${completeness >= 80 ? "bg-emerald-500" : completeness >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${completeness}%` }} /></div>
            <div className="text-[11px] text-slate-400">Created {fmtDate(c.createdAt)} · Updated {fmtDate(c.updatedAt)}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <Btn onClick={runAI} disabled={analyzing || uploading > 0 || caseDocs.length === 0}>
            {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {analyzing ? "Analyzing…" : `Run AI Analysis (${modeLabel})`}
          </Btn>
          <Btn variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>{uploading > 0 ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} {uploading > 0 ? `Uploading ${uploading}…` : "Upload Documents"}</Btn>
          <Btn variant="secondary" onClick={() => requestDocs("Case worker requested more documents from client")}><FilePlus size={15} /> Request Documents</Btn>
          <Btn variant="ghost" onClick={flag}><Flag size={15} /> Flag for Investigation</Btn>
          {isManager && <Btn variant="ghost" className="ml-auto text-rose-600 hover:bg-rose-50" onClick={removeCase}><Trash2 size={15} /> {confirmDelete ? "Confirm delete" : "Delete case"}</Btn>}
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.csv,.md" className="hidden" onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }} />
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
        <div className="grid gap-5 lg:grid-cols-3 *:min-w-0">
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
                  <span className="flex gap-1.5"><EngineBadge engine={caseRec.engine} /><StatusBadge status={caseRec.status} /></span>
                </div>
                <div className="mt-1 text-sm font-extrabold text-[#0f2043]">{caseRec.title}</div>
                <div className="mt-1 text-xs text-slate-600">{caseRec.summary}</div>
                <button onClick={() => setTab("recommendation")} className="mt-2 text-xs font-bold text-[#2563eb] hover:underline">View full explanation →</button>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-extrabold text-[#0f2043]">Required Documents Checklist</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Matched by document name and content — confirm each item yourself.</p>
            <div className="mt-3 space-y-2">
              {checklist.items.map(item => (
                <div key={item.name} title={item.matchedDoc ? `Matched: ${item.matchedDoc}` : undefined} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold ${item.present ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  {item.present ? <CheckCircle2 size={15} className="shrink-0" /> : <XCircle size={15} className="shrink-0" />}
                  <span className="min-w-0">{item.name}{item.matchedDoc && <span className="block truncate text-[10px] font-medium opacity-70">{item.matchedDoc}</span>}</span>
                  <span className="ml-auto text-[10px] font-extrabold uppercase">{item.present ? "Present" : "Missing"}</span>
                </div>
              ))}
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
            <div className="mt-1 text-xs text-slate-400">or click to browse · up to 10 MB each · text is extracted on the server (scanned PDFs need OCR, not yet supported)</div>
          </div>
          {caseDocs.length === 0 ? (
            <EmptyState icon={<FileText size={22} />} title="No documents yet" desc="Upload at least one document, then run AI Analysis to extract facts and generate a recommendation." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 *:min-w-0">
              {caseDocs.map(d => (
                <Card key={d.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><FileText size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-extrabold text-slate-800">{d.name}</div>
                      <div className="text-[11px] text-slate-400">{d.type} · {fmtSize(d.size)} · {d.pageCount} page(s){d.type !== "PDF" && d.pageCount > 1 ? " (estimated)" : ""} · {d.source} · {fmtDate(d.uploadedAt)}</div>
                      <div className="mt-1.5"><StatusBadge status={d.status} /></div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setViewDoc(viewDoc === d.id ? null : d.id)} title="View extracted text" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Eye size={15} /></button>
                      <button onClick={() => { const blob = new Blob([(d.extractedText || "").replace(/\f/g, "\n\n--- page break ---\n\n")], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = d.name.replace(/\.[^.]+$/, "") + "_extracted.txt"; a.click(); URL.revokeObjectURL(url); }} title="Download extracted text" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Download size={15} /></button>
                    </div>
                  </div>
                  {viewDoc === d.id && <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 scrollbar-thin">{d.extractedText ? d.extractedText.replace(/\f/g, "\n\n— page break —\n\n") : "No extractable text."}</div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "analysis" && (
        <div className="space-y-4">
          <AiModeBanner />
          {caseEx.length === 0 ? (
            <EmptyState icon={<BrainCircuit size={22} />} title="No analysis yet" desc="Click 'Run AI Analysis' to extract facts with source citations, detect contradictions and identify missing information." action={<Btn onClick={runAI} disabled={analyzing || caseDocs.length === 0}><Sparkles size={15} /> Run AI Analysis</Btn>} />
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
                        <tr key={e.id} className={`border-b border-slate-100 align-top ${e.verified === false ? "bg-rose-50/50" : ""}`}>
                          <td className="py-2.5 pr-3 font-bold text-slate-700">{e.fieldName}</td>
                          <td className="py-2.5 pr-3 font-semibold text-slate-800">{e.fieldValue}</td>
                          <td className="py-2.5 pr-3 text-slate-500">{e.sourceDoc} · p.{e.sourcePage}{e.verified === false && <UnverifiedBadge />}</td>
                          <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${e.confidence >= 90 ? "bg-emerald-100 text-emerald-700" : e.confidence >= 60 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{e.confidence}%</span></td>
                          <td className="max-w-[220px] py-2.5 text-slate-500">“{e.sourceSnippet}”</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 *:min-w-0">
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-rose-700"><AlertTriangle size={15} /> Missing Information ({missing.length})</h3>
                  {missing.length === 0 ? <p className="mt-2 text-xs text-slate-500">No required documents missing. All checklist items are present.</p> : <ul className="mt-2 space-y-1.5 text-xs text-slate-600">{missing.map(m => <li key={m} className="flex gap-2"><XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />{m}</li>)}</ul>}
                </Card>
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-violet-700"><AlertTriangle size={15} /> Contradictions Detected ({caseRec?.contradictions?.length ?? 0})</h3>
                  {caseRec?.contradictions?.length ? (
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">{caseRec.contradictions.map((x, i) => <li key={i} className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-violet-500" />{x}</li>)}</ul>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No contradictions detected in the latest analysis. {config.aiMode === "demo" && "The demo engine compares income and rent figures and checks termination timelines."}</p>
                  )}
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "recommendation" && (
        <div className="space-y-4">
          {!caseRec ? (
            <EmptyState icon={<Sparkles size={22} />} title="No recommendation yet" desc="Run AI Analysis to generate an explainable recommendation with evidence, confidence and uncertainties." action={<Btn onClick={runAI} disabled={analyzing || caseDocs.length === 0}><Sparkles size={15} /> Run AI Analysis</Btn>} />
          ) : (
            <>
              <AiModeBanner />
              <Card className="overflow-hidden">
                <div className="border-b border-slate-100 bg-gradient-to-r from-[#0f2043] to-[#1e3a5f] p-5 text-white sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-300">AI Recommendation · {caseRec.engine === "llm" ? "Live AI" : caseRec.engine === "seed" ? "Sample data" : "Demo engine"}</div>
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
                        <div key={i} className={`rounded-xl border p-3 ${ev.verified === false ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
                          <div className="text-xs font-bold text-slate-800">{ev.claim}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-blue-700"><FileText size={12} /> {ev.doc} · Page {ev.page}{ev.verified === false && <UnverifiedBadge />}</div>
                          <div className="mt-1 text-[11px] italic leading-relaxed text-slate-500">“{ev.snippet}”</div>
                        </div>
                      ))}
                      {caseRec.evidence.length === 0 && <p className="text-xs text-slate-400">No evidence cited — treat this recommendation with extra caution.</p>}
                    </div>
                  </div>
                  <div>
                    {!!caseRec.contradictions?.length && (
                      <>
                        <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Contradictions</h3>
                        <ul className="mb-5 mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700">{caseRec.contradictions.map((x, i) => <li key={i} className="flex gap-2"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-violet-500" />{x}</li>)}</ul>
                      </>
                    )}
                    <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Missing Information</h3>
                    {caseRec.missingInfo.length === 0 ? <p className="mt-2 text-xs text-emerald-700">None — all required items present.</p> : <ul className="mt-2 space-y-1.5 text-xs text-slate-700">{caseRec.missingInfo.map(m => <li key={m} className="flex gap-2"><XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />{m}</li>)}</ul>}
                    <h3 className="mt-5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Uncertainties & Possible Exceptions</h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700">{caseRec.uncertainties.map((u, i) => <li key={i} className="flex gap-2"><Clock size={13} className="mt-0.5 shrink-0 text-amber-500" />{u}</li>)}</ul>
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
                {recLocked ? (
                  <div className="mt-2 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    <Lock size={14} className="mt-0.5 shrink-0" />
                    <span>This recommendation was <b>{caseRec.status}</b>{caseRec.reviewedBy ? ` by ${caseRec.reviewedBy}` : ""} and is locked. Run a new analysis to get a fresh recommendation.</span>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 text-xs text-slate-500">Your decision is recorded in the audit trail under your name. The AI recommendation is advisory only.</p>
                    <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} rows={2} placeholder="Add a comment (optional) — e.g. 'Verified against originals. Proceeding.'" className="mt-3 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                    {editing && <textarea value={modifiedText} onChange={e => setModifiedText(e.target.value)} rows={2} placeholder="Modified recommendation text…" className="mt-2 w-full rounded-xl border border-blue-300 bg-blue-50 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500" />}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn variant="success" disabled={reviewing} onClick={() => review("approved")}>{reviewing ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Approve</Btn>
                      <Btn variant="secondary" disabled={reviewing} onClick={() => setEditing(!editing)}><Pencil size={15} /> Modify</Btn>
                      {editing && <Btn disabled={reviewing} onClick={() => review("modified")}><CheckCircle2 size={15} /> Save Modification</Btn>}
                      <Btn variant="danger" disabled={reviewing} onClick={() => review("rejected")}><XCircle size={15} /> Reject</Btn>
                      <Btn variant="ghost" onClick={() => requestDocs("Requested via recommendation panel")}><MessageSquare size={15} /> Request Documents</Btn>
                    </div>
                  </>
                )}
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
          <p className="mt-0.5 text-xs text-slate-400">Every upload, analysis, extraction, recommendation and human action with date & time, newest first.</p>
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
