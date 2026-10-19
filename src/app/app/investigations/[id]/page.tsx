import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { geminiConfigured } from "@/lib/env";
import { getPeople } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Notice, PageHeader, fmt } from "@/components/ui";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { addEvidence, addStep, closeInvestigation, confirmRootCause, reviewEvidence, runInvestigationAI } from "../../ops-actions";
import type { InvestigationAnalysis } from "@/lib/ai/schemas";

export const metadata = { title: "Investigation" };

const KINDS = {
  observed_evidence: { label: "Observed evidence", hint: "What the records directly show", tone: "blue" },
  possible_contributor: { label: "Possible contributors", hint: "Factors that may be related", tone: "neutral" },
  root_cause_hypothesis: { label: "Root-cause hypotheses", hint: "Explanations that require investigation", tone: "amber" },
  confirmed_root_cause: { label: "Confirmed root cause", hint: "Human-confirmed with sufficient evidence", tone: "green" },
} as const;

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const sb = await createClient();
  const { data: inv } = await sb.from("investigations").select("*").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!inv) notFound();
  const [{ data: ev }, { data: steps }, { data: eq }, { data: run }, people, { data: res }] = await Promise.all([
    sb.from("investigation_evidence").select("*").eq("investigation_id", id).order("created_at"),
    sb.from("troubleshooting_steps").select("*").eq("investigation_id", id).order("created_at"),
    inv.equipment_id ? sb.from("equipment").select("id,name,identifier").eq("id", inv.equipment_id).single() : Promise.resolve({ data: null }),
    sb.from("ai_agent_runs").select("id").eq("org_id", ctx.orgId).eq("agent", "incident_investigation").order("created_at", { ascending: false }).limit(1),
    getPeople(sb, ctx.orgId),
    sb.from("work_orders").select("id,wo_number,title,status").eq("investigation_id", id),
  ]);
  const ai = inv.ai_analysis as InvestigationAnalysis | null;
  const closed = inv.status === "closed";
  const staff = can(ctx.role, "investigation.confirm");
  const who = (u: string | null) => people.find((p) => p.id === u)?.name ?? "—";

  return (
    <>
      <PageHeader eyebrow="Investigation" title={inv.title} subtitle={<>{eq ? <Link className="font-semibold underline" href={`/app/equipment/${eq.id}`}>{eq.name}</Link> : "No machine"} · opened {fmt(inv.created_at)} · owner {who(inv.owner_id)} · <Badge tone={closed ? "green" : "amber"}>{inv.status.replace("_", " ")}</Badge></>} />
      <div className="mb-6"><Notice tone="blue" title="How to read this page">AI proposals are labelled <b>proposed</b> and never count as established. Accept or reject each one. A root cause is only “confirmed” when a qualified person records it.</Notice></div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="1 · Reported problem"><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{inv.reported_problem}</p></Card>

          {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => {
            const rows = ev?.filter((e) => e.kind === k) ?? [];
            return (
              <Card key={k} title={`${KINDS[k].label} (${rows.length})`}>
                <p className="mb-3 text-[13px] text-ink-400">{KINDS[k].hint}</p>
                {rows.length ? <ul className="space-y-2.5">{rows.map((e) => (
                  <li key={e.id} className="rounded-lg bg-canvas-soft p-3.5 text-[14px]">
                    <p>{e.statement}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                      <Badge tone={e.origin === "ai" ? "blue" : "neutral"}>{e.origin === "ai" ? "AI-proposed" : "Added by person"}</Badge>
                      <Badge tone={e.review_status === "accepted" ? "green" : e.review_status === "rejected" ? "red" : "amber"}>{e.review_status}</Badge>
                      {e.source_table && <span className="text-ink-400">source: {e.source_table}</span>}
                      {!closed && can(ctx.role, "investigation.run") && e.review_status === "proposed" && (
                        <form action={reviewEvidence.bind(null, id, e.id)} className="flex gap-1.5"><button name="review_status" value="accepted" className="btn-ghost btn-sm !px-3 !py-1">Accept</button><button name="review_status" value="rejected" className="btn-ghost btn-sm !px-3 !py-1">Reject</button></form>)}
                    </div>
                  </li>))}</ul> : <p className="text-[14px] text-ink-400">None recorded.</p>}
              </Card>);
          })}

          {ai && (
            <Card title="AI analysis: missing information & next steps">
              {ai.missing_information.length > 0 && <div className="mb-4"><p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">Missing information</p><ul className="list-disc pl-5 text-[14px]">{ai.missing_information.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
              {ai.recommended_next_steps.length > 0 && <div className="mb-4"><p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">Recommended next investigation (qualified review required)</p><ul className="space-y-1.5 text-[14px]">{ai.recommended_next_steps.map((s, i) => <li key={i}>• {s.step}<span className="block text-[12px] text-ink-400">Basis: {s.basis}</span></li>)}</ul></div>}
              {ai.prior_attempts.length > 0 && <div><p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">Prior attempts found in records</p><ul className="list-disc pl-5 text-[14px]">{ai.prior_attempts.map((a, i) => <li key={i}>{a.statement}: <span className="font-semibold">{a.outcome}</span></li>)}</ul></div>}
              {run?.[0] && <div className="mt-5 border-t border-canvas-line pt-4"><p className="mb-2 text-[13px] text-ink-400">Was this analysis useful?</p><FeedbackButtons table="ai_agent_runs" targetId={run[0].id} /></div>}
            </Card>)}

          <Card title="Troubleshooting steps taken">
            {steps?.length ? <ul className="mb-4 space-y-2 text-[14px]">{steps.map((s) => <li key={s.id}>{s.description} <Badge tone={s.outcome === "worked" ? "green" : s.outcome === "failed" ? "red" : "neutral"}>{s.outcome}</Badge> <span className="text-[12px] text-ink-400">{who(s.performed_by)} · {fmt(s.created_at)}</span></li>)}</ul> : <p className="mb-4 text-[14px] text-ink-400">None logged. Record failed attempts too; they are valuable knowledge.</p>}
            {!closed && can(ctx.role, "capture") && (
              <form action={addStep.bind(null, id)} className="flex flex-wrap gap-2"><input name="description" required placeholder="What was tried" className="field flex-1" aria-label="Step" /><select name="outcome" className="field !w-32" aria-label="Outcome">{["unknown", "worked", "partial", "failed"].map((o) => <option key={o}>{o}</option>)}</select><button className="btn-dark btn-sm">Add step</button></form>)}
          </Card>
        </div>

        <div className="space-y-6">
          {!closed && (
            <Card title="AI evidence organiser">
              <p className="mb-3 text-[13px] text-ink-500">Collects this machine’s recorded history and proposes evidence, contributors and hypotheses to test. Results are proposals only.</p>
              {can(ctx.role, "investigation.run") ? <ActionForm action={runInvestigationAI.bind(null, id)}><SubmitButton pendingText="Analysing records…" className="btn-primary w-full" >{ai ? "Re-run analysis" : "Organise evidence with AI"}</SubmitButton></ActionForm> : null}
              {!geminiConfigured() && <p className="mt-3 text-[12px] text-amber-700">GEMINI_API_KEY is not set.</p>}
            </Card>)}
          {!closed && can(ctx.role, "capture") && (
            <Card title="Add your own finding">
              <form action={addEvidence.bind(null, id)} className="space-y-3">
                <select name="kind" className="field" aria-label="Type"><option value="observed_evidence">Observed evidence</option><option value="possible_contributor">Possible contributor</option><option value="root_cause_hypothesis">Hypothesis</option></select>
                <textarea name="statement" required rows={3} className="field" placeholder="State what you observed or suspect" aria-label="Statement" />
                <button className="btn-dark w-full">Add</button>
              </form>
            </Card>)}
          {!closed && staff && (
            <Card title="Confirm root cause">
              <p className="mb-3 text-[13px] text-ink-500">Only record this when evidence supports it. Your name is stored with the confirmation.</p>
              <ActionForm action={confirmRootCause.bind(null, id)} className="space-y-3"><textarea name="confirmed_root_cause" rows={3} defaultValue={inv.confirmed_root_cause ?? ""} className="field" aria-label="Confirmed root cause" /><SubmitButton className="btn-dark w-full">Confirm root cause</SubmitButton></ActionForm>
            </Card>)}
          {!closed && staff && (
            <Card title="Resolve and close">
              <ActionForm action={closeInvestigation.bind(null, id)} className="space-y-3">
                <textarea name="resolution" required rows={3} className="field" placeholder="What resolved it?" aria-label="Resolution" />
                <input name="parts_replaced" className="field" placeholder="Parts replaced" aria-label="Parts" />
                <input name="outcome" className="field" placeholder="Outcome / verification plan" aria-label="Outcome" />
                <SubmitButton className="btn-primary w-full">Close and preserve knowledge</SubmitButton>
              </ActionForm>
            </Card>)}
          {closed && <Card title="Resolution"><p className="text-[14px]"><b>Root cause:</b> {inv.confirmed_root_cause ?? "Not established"}</p><p className="mt-2 text-[14px]"><b>Resolution:</b> {inv.resolution}</p><p className="mt-2 text-[13px] text-ink-400">Closed {fmt(inv.closed_at)}. Preserved in the knowledge base.</p></Card>}
          {res?.length ? <Card title="Linked work orders"><ul className="text-[14px]">{res.map((w) => <li key={w.id}>WO-{w.wo_number} {w.title} <Badge>{w.status}</Badge></li>)}</ul></Card> : null}
        </div>
      </div>
    </>
  );
}
