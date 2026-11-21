"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FolderPlus, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useStore, errorMessage } from "@/lib/store";
import { Card, Field, inputCls, Btn, SafetyBanner } from "@/components/ui";
import { CASE_TYPES } from "@/lib/core";

export default function NewCasePage() {
  const router = useRouter();
  const { addCase, log, user } = useStore();
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [caseType, setCaseType] = useState(CASE_TYPES[0]);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !clientName.trim()) { setError("Title and client name are required."); return; }
    setError(""); setSaving(true);
    try {
      const c = await addCase({ title: title.trim(), clientName: clientName.trim(), caseType, status: "awaiting_review", priority, description: description.trim() || "New case — documents to be uploaded.", assignedTo: user?.name || "Unassigned" });
      await log(c.id, "Case created", `Case ${c.caseNumber} opened for ${c.clientName} (${c.caseType})`, "case");
      router.push(`/cases/${c.id}`);
    } catch (err) {
      setError(`Could not create the case: ${errorMessage(err)}`);
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fadeUp">
      <Link href="/cases" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-fg"><ArrowLeft size={13} /> Back to cases</Link>
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-fg">Create a New Case</h1>
        <p className="mt-0.5 text-sm text-muted">Open a case, then upload documents and run AI analysis. All data is fictional for this demo.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Case title"><input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Eviction Defense — 14-Day Notice Response" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client name"><input value={clientName} onChange={e => setClientName(e.target.value)} className={inputCls} placeholder="e.g. Maria Gonzalez" /></Field>
            <Field label="Case type">
              <select value={caseType} onChange={e => setCaseType(e.target.value)} className={inputCls}>{CASE_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            </Field>
          </div>
          <Field label="Priority">
            <select value={priority} onChange={e => setPriority(e.target.value as any)} className={inputCls}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Description"><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className={inputCls} placeholder="Brief summary of the situation…" /></Field>
          {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400">{error}</div>}
          <div className="flex gap-2 pt-1">
            <Btn type="submit" disabled={saving}><FolderPlus size={15} /> {saving ? "Creating…" : "Create Case"}</Btn>
            <Link href="/cases"><Btn variant="secondary">Cancel</Btn></Link>
          </div>
        </form>
      </Card>
      <SafetyBanner />
      <div className="flex items-start gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12px] text-muted">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" />
        <span>Next step after creating: upload documents on the case page, then click <b>Run AI Analysis</b>. Every action is written to the audit trail.</span>
      </div>
    </div>
  );
}
