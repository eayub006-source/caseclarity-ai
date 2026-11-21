"use client";
import { BarChart3, Info, FlaskConical, CheckCircle2 } from "lucide-react";
import { Card, Badge, AiModeBanner } from "@/components/ui";
import { useStore } from "@/lib/store";
import { EVALUATION } from "@/lib/core";

export default function EvaluationPage() {
  const { cases, docs, extractions, recs } = useStore();
  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="text-3xl font-medium tracking-tight text-fg">Performance Evaluation</h1>
        <p className="mt-0.5 text-sm text-muted">How AI-assisted review compares to manual review — with honest labeling.</p>
      </div>
      <AiModeBanner />
      <div className="flex items-start gap-2 rounded-xl border border-ember-30 bg-ember-10 px-3 py-2.5 text-xs leading-relaxed text-fg-2">
        <Info size={15} className="mt-0.5 shrink-0" />
        <span><b>{EVALUATION.label}.</b> These figures are illustrative placeholders for the hackathon demo — they are <b>not</b> real-world results. The data structure below is designed to be replaced with actual testing results (e.g. from a timed user study with case workers).</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {EVALUATION.metrics.map(m => {
          const max = Math.max(m.manual, m.ai) * 1.15;
          return (
            <Card key={m.name} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">{m.name}</h3>
                <Badge tone="slate">{m.unit}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-muted"><span>Manual review</span><span>{m.manual}{m.unit}</span></div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-faint" style={{ width: `${(m.manual / max) * 100}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] font-semibold text-accent"><span>AI-assisted (human verifies)</span><span>{m.ai}{m.unit}</span></div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-gradient-to-r from-ember-60 to-accent" style={{ width: `${(m.ai / max) * 100}%` }} /></div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted">{m.note}</p>
            </Card>
          );
        })}
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg"><FlaskConical size={15} /> How to Replace With Real Results</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[{ t: "1. Timed user study", d: "Have 5–10 case workers review the same fictional cases manually and with AI assistance. Record time per case." }, { t: "2. Extraction benchmark", d: "Score extracted fields against a gold-standard annotation of the demo documents. Report precision/recall per field type." }, { t: "3. Evidence coverage audit", d: "Have reviewers rate whether each recommendation claim has adequate source citation. Report % with inter-rater agreement." }].map(x => (
            <div key={x.t} className="rounded-xl bg-panel-2 p-4"><div className="text-xs font-semibold text-fg">{x.t}</div><div className="mt-1 text-[11px] leading-relaxed text-muted">{x.d}</div></div>
          ))}
        </div>
        <div className="mt-4 flex items-start gap-2 text-[11px] text-muted"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" /> Until real testing is done, all metrics on this page must be presented as illustrative demo measurements — never as validated performance claims.</div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg"><BarChart3 size={15} /> Current Workspace Totals</h2>
        <p className="mt-1 text-xs text-muted">Live counts from your workspace.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[{ k: "Cases", v: String(cases.length) }, { k: "Documents", v: String(docs.length) }, { k: "Facts extracted", v: String(extractions.length) }, { k: "Recommendations", v: String(recs.length) }].map(s => (
            <div key={s.k} className="rounded-xl bg-panel-2 p-4 text-center"><div className="text-2xl font-semibold text-fg">{s.v}</div><div className="text-[11px] font-semibold text-muted">{s.k}</div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
