import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { geminiConfigured } from "@/lib/env";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { Badge, Card, PageHeader, fmt } from "@/components/ui";
import { HandoverWorkspace } from "@/components/handover-workspace";
import { ReportView } from "@/components/report-view";
import { TaskCard } from "@/components/task-controls";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { acknowledgeHandover } from "../actions";
import type { StoredReport } from "@/lib/ai/agents";

export const metadata = { title: "Handover" };

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const sb = await createClient();
  const { data: h } = await sb.from("handovers").select("*, production_lines(name), facilities(name)").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!h) notFound();
  const report = h.report as StoredReport | null;
  const title = `${h.shift_label ?? "Shift"} handover · ${h.shift_date}`;

  if (h.status === "draft") {
    return (
      <>
        <PageHeader eyebrow="Draft handover" title={title} subtitle={`${(h.facilities as unknown as { name: string } | null)?.name ?? ""} ${(h.production_lines as unknown as { name: string } | null)?.name ? "· " + (h.production_lines as unknown as { name: string }).name : ""}`} />
        {h.author_id !== ctx.userId && !can(ctx.role, "handover.review") ? (
          <Card><p className="text-ink-500">This draft belongs to another operator and is not yet submitted.</p></Card>
        ) : (
          <HandoverWorkspace key={h.updated_at} handoverId={h.id} orgId={ctx.orgId} initialNotes={h.source_notes} initialReport={report} aiReady={geminiConfigured()} />
        )}
      </>
    );
  }

  const [people, equipment, { data: tasks }, { data: acks }, { data: edits }] = await Promise.all([
    getPeople(sb, ctx.orgId), getEquipmentList(sb, ctx.orgId),
    sb.from("follow_up_tasks").select("*").eq("handover_id", id).order("created_at"),
    sb.from("handover_acknowledgements").select("user_id,note,created_at").eq("handover_id", id),
    sb.from("handover_edits").select("id,editor_id,summary,created_at").eq("handover_id", id).order("created_at"),
  ]);
  const eq = nameMap(equipment);
  const who = (uid: string) => people.find((p) => p.id === uid)?.name ?? "Member";
  const mine = acks?.some((a) => a.user_id === ctx.userId);
  const ack = acknowledgeHandover.bind(null, id);

  return (
    <>
      <PageHeader
        eyebrow={h.status === "acknowledged" ? "Acknowledged handover" : "Submitted handover"} title={title}
        subtitle={<>By {who(h.author_id)} · submitted {fmt(h.submitted_at)} · <Badge tone={h.status === "acknowledged" ? "green" : "amber"}>{h.status}</Badge></>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title="Approved report">{report ? <ReportView report={report} /> : <p>No report stored.</p>}
            {report && h.ai_run_id && <div className="mt-6 border-t border-canvas-line pt-4"><p className="mb-2 text-[13px] text-ink-400">Was this AI report useful?</p><FeedbackButtons table="ai_agent_runs" targetId={h.ai_run_id} /></div>}
          </Card>
          <Card title="Issues for the incoming shift">
            {tasks?.length ? <ul className="space-y-3">{tasks.map((t) => <TaskCard key={t.id} t={t} people={people} equipmentName={t.equipment_id ? eq.get(t.equipment_id) : undefined} canEdit={can(ctx.role, "followup.update")} />)}</ul> : <p className="text-ink-500">No open issues were raised in this handover.</p>}
          </Card>
          <details className="card p-5"><summary className="cursor-pointer text-[16px] font-bold">Original operator notes (preserved)</summary>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-canvas-soft p-4 font-sans text-[14px] leading-relaxed">{h.source_notes}</pre></details>
        </div>
        <aside className="space-y-6">
          <Card title="Acknowledgement">
            {acks?.length ? <ul className="mb-4 space-y-2 text-[14px]">{acks.map((a) => <li key={a.user_id}><span className="font-semibold">{who(a.user_id)}</span> · {fmt(a.created_at)}{a.note && <span className="block text-ink-500">“{a.note}”</span>}</li>)}</ul> : <p className="mb-4 text-[14px] text-ink-500">Not yet acknowledged by the incoming shift.</p>}
            {can(ctx.role, "capture") && !mine && h.author_id !== ctx.userId && (
              <form action={ack} className="space-y-3"><input name="note" className="field" placeholder="Optional note to outgoing shift" /><button className="btn-primary w-full">Acknowledge handover</button></form>)}
          </Card>
          <Card title="Edit history">
            <ul className="space-y-2 text-[13px]">{edits?.map((e) => <li key={e.id}><span className="font-semibold">{who(e.editor_id)}</span> · {e.summary}<span className="block text-ink-400">{fmt(e.created_at)}</span></li>)}</ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
