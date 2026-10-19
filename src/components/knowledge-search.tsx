"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { askKnowledge, type AskState } from "@/app/app/knowledge/actions";
import { FeedbackButtons } from "./feedback-buttons";
import { Badge, Notice, VerificationBadge } from "./ui";

function Go() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Searching records…" : "Ask"}</button>;
}

const EXAMPLES = ["How did we resolve this fault last time?", "Has Press 3 had similar stoppages?", "Which maintenance actions failed to resolve this issue?", "What problems were carried over from the last night shift?"];

export function KnowledgeSearch({ equipment, aiReady }: { equipment: { id: string; name: string }[]; aiReady: boolean }) {
  const [state, action] = useActionState<AskState, FormData>(askKnowledge, undefined);
  const r = state?.result;
  return (
    <div className="card p-6">
      <form action={action} className="space-y-4">
        <label htmlFor="question" className="text-[18px] font-bold">Ask your factory’s knowledge base</label>
        <textarea id="question" name="question" rows={2} required className="field text-[16px]" placeholder={EXAMPLES[0]} defaultValue={state?.question} />
        <div className="flex flex-wrap items-center gap-3">
          <select name="equipment_id" aria-label="Limit to machine" className="field !w-56"><option value="">All machines</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <Go />
        </div>
        <div className="flex flex-wrap gap-2">{EXAMPLES.map((x) => <button type="button" key={x} className="rounded-full bg-canvas-soft px-3 py-1 text-[12px] font-medium text-ink-500 hover:bg-amber-50" onClick={() => { const t = document.getElementById("question") as HTMLTextAreaElement; t.value = x; t.focus(); }}>{x}</button>)}</div>
        {!aiReady && <Notice tone="amber" title="AI not configured">Set GEMINI_API_KEY to enable answers. Browsing and filtering records below still works.</Notice>}
      </form>
      {state?.error && <div className="mt-5"><Notice tone="red">{state.error}</Notice></div>}
      {r && (
        <div className="mt-6 space-y-5 border-t border-canvas-line pt-6">
          <div className={`rounded-xl p-5 ${r.answerable ? "bg-canvas-soft" : "bg-amber-50 ring-1 ring-amber-100"}`}>
            <p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">{r.answerable ? "Answer from stored records" : "No reliable answer found"} · {r.mode} search</p>
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed">{r.answer}</p>
            {r.caveats.length > 0 && <ul className="mt-3 list-disc pl-5 text-[13px] text-ink-500">{r.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            {r.unverified_suggestions.length > 0 && <div className="mt-3 rounded-lg border border-dashed border-amber p-3 text-[13px]"><p className="font-bold text-amber-700">Unverified suggestions (not from your records)</p><ul className="list-disc pl-5">{r.unverified_suggestions.map((c, i) => <li key={i}>{c}</li>)}</ul><p className="mt-1 text-ink-400">Have a qualified person review before acting. Follow approved procedures.</p></div>}
          </div>
          {r.sources.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Supporting records ({r.sources.length})</p>
              <ul className="space-y-3">{r.sources.map((s) => (
                <li key={s.id} className="rounded-xl border border-canvas-line p-4">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-bold">{s.title}</p><VerificationBadge level={s.verification} /><Badge>{s.kind.replace("_", " ")}</Badge><span className="text-[12px] text-ink-400">{new Date(s.occurred_at).toLocaleDateString("en-GB")}</span></div>
                  <p className="mt-1 text-[14px] text-ink-500">{s.snippet}</p>
                  {s.supports && <p className="mt-1 text-[13px] font-medium text-signal-blue">Used for: {s.supports}</p>}
                  {s.equipment_id && <Link className="mt-1 inline-block text-[13px] font-semibold underline" href={`/app/equipment/${s.equipment_id}`}>Open equipment record</Link>}
                </li>))}</ul>
            </div>)}
          {state?.runId && <div><p className="mb-2 text-[13px] text-ink-400">Was this answer useful?</p><FeedbackButtons table="ai_agent_runs" targetId={state.runId} /></div>}
        </div>
      )}
    </div>
  );
}
