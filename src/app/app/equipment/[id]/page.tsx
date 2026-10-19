import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getPeople } from "@/lib/data";
import { computeStats, minutesOf, type DtEvent } from "@/lib/downtime";
import { Badge, Card, EmptyState, PageHeader, Stat, fmt, mins, priorityTone, statusTone, VerificationBadge } from "@/components/ui";
import { TaskCard } from "@/components/task-controls";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { runWorkOrderDraft, setEquipmentStatus, runDowntimeAnalysis } from "../../ops-actions";

export const metadata = { title: "Equipment intelligence" };

export default async function EquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const sb = await createClient();
  const { data: e } = await sb.from("equipment").select("*, production_lines(name)").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!e) notFound();
  const [inc, dt, mt, tasks, wos, res, kn, docs, insights, people] = await Promise.all([
    sb.from("incidents").select("*").eq("equipment_id", id).order("occurred_at", { ascending: false }).limit(15),
    sb.from("downtime_events").select("id,equipment_id,started_at,ended_at,duration_minutes,fault_code,shift_label,context,cause_category,source").eq("equipment_id", id).order("started_at", { ascending: false }).limit(200),
    sb.from("maintenance_records").select("*").eq("equipment_id", id).order("performed_at", { ascending: false }).limit(15),
    sb.from("follow_up_tasks").select("*").eq("equipment_id", id).neq("status", "resolved").order("created_at", { ascending: false }),
    sb.from("work_orders").select("id,wo_number,title,status,priority").eq("equipment_id", id).not("status", "in", "(completed,cancelled,rejected)"),
    sb.from("confirmed_resolutions").select("*").eq("equipment_id", id).order("created_at", { ascending: false }).limit(10),
    sb.from("knowledge_records").select("id,title,verification,kind,occurred_at").eq("equipment_id", id).order("occurred_at", { ascending: false }).limit(8),
    sb.from("operational_documents").select("id,title,doc_type,approved").eq("equipment_id", id),
    sb.from("ai_insights").select("id,title,body,created_at").eq("equipment_id", id).order("created_at", { ascending: false }).limit(1),
    getPeople(sb, ctx.orgId),
  ]);
  const events = (dt.data ?? []) as (DtEvent & { source: string })[];
  const stats = computeStats(events);
  const owner = people.find((p) => p.id === e.maintenance_owner)?.name;
  const insight = insights.data?.[0]?.body as { summary?: string; patterns?: { description: string; basis: string; strength: string }[]; data_limitations?: string[] } | undefined;
  const setStatus = setEquipmentStatus.bind(null, id);
  return (
    <>
      <PageHeader eyebrow={`${(e.production_lines as unknown as { name: string } | null)?.name ?? "No line"} · ${e.identifier}`} title={e.name}
        subtitle={[e.equipment_type, e.manufacturer, e.model].filter(Boolean).join(" · ") || "Equipment record"}
        actions={<><Link className="btn-ghost btn-sm" href={`/app/investigations?new=${id}`}>Open investigation</Link></>} />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Badge tone={statusTone(e.status)}>{e.status}</Badge>
        <span className="text-[13px] text-ink-400">Status last reported {fmt(e.status_updated_at)}. Not connected to live telemetry.</span>
        {can(ctx.role, "capture") && (
          <form action={setStatus} className="flex gap-2"><select name="status" defaultValue={e.status} aria-label="Report status" className="field !w-40 !py-1.5 text-sm">{["running", "degraded", "stopped", "maintenance", "unknown"].map((s) => <option key={s}>{s}</option>)}</select><button className="btn-ghost btn-sm">Update</button></form>)}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open issues" value={tasks.data?.length ?? 0} tone={tasks.data?.length ? "amber" : undefined} />
        <Stat label="Stoppages recorded" value={stats.total} />
        <Stat label="Recorded downtime" value={mins(stats.withDuration ? stats.totalMinutes : null)} hint={`${stats.withDuration} of ${stats.total} with duration`} />
        <Stat label="Recurring fault groups" value={stats.recurring.length} tone={stats.recurring.length ? "amber" : undefined} hint="3+ same fault" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Open issues">
            {tasks.data?.length ? <ul className="space-y-3">{tasks.data.map((t) => <TaskCard key={t.id} t={t} people={people} canEdit={can(ctx.role, "followup.update")} />)}</ul> : <p className="text-ink-500">No unresolved issues recorded for this machine.</p>}
          </Card>
          <Card title="Recurring faults and repeated context">
            {stats.recurring.length || stats.contextRepeats.length ? (
              <ul className="space-y-2 text-[15px]">
                {stats.recurring.map((r) => <li key={r.eventIds[0]}><Badge tone="amber">{r.count}×</Badge> Fault {r.faultCode ? <span className="font-mono">{r.faultCode}</span> : "(no code recorded)"}</li>)}
                {stats.contextRepeats.map((c) => <li key={c.eventIds[0]}><Badge tone="blue">{c.count}×</Badge> Stoppages recorded with context “{c.context}”</li>)}
              </ul>) : <p className="text-ink-500">Not enough repeated events to show a pattern. Counts are derived only from recorded events.</p>}
            {insight?.summary && <div className="mt-4 rounded-lg bg-canvas-soft p-4 text-[14px]"><p className="mb-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">Latest AI analysis (interpretation)</p>{insight.summary}
              {insight.patterns?.map((p, i) => <p key={i} className="mt-2"><Badge>{p.strength}</Badge> {p.description} <span className="text-ink-400">({p.basis})</span></p>)}
              {insight.data_limitations?.map((l, i) => <p key={i} className="mt-1 text-[12px] text-ink-400">Limitation: {l}</p>)}</div>}
          </Card>
          <Card title="Incident history">
            {inc.data?.length ? <ul className="divide-y divide-canvas-line">{inc.data.map((i) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5"><span><span className="font-semibold">{i.title}</span> <span className="text-[13px] text-ink-400">{fmt(i.occurred_at)}</span></span><span className="flex gap-2"><Badge tone={priorityTone(i.severity)}>{i.severity}</Badge><Badge tone={statusTone(i.status)}>{i.status}</Badge></span></li>)}</ul> : <p className="text-ink-500">No incidents recorded.</p>}
          </Card>
          <Card title="Maintenance history">
            {mt.data?.length ? <ul className="divide-y divide-canvas-line">{mt.data.map((m) => <li key={m.id} className="py-2.5 text-[14px]"><p><span className="font-semibold">{m.action_type ?? "Maintenance"}</span> · {fmt(m.performed_at, false)} · <Badge tone={m.outcome === "resolved" ? "green" : m.outcome === "not_resolved" ? "red" : "neutral"}>{m.outcome}</Badge></p><p className="text-ink-500">{m.description}</p>{m.parts_replaced && <p className="text-[13px] text-ink-400">Parts: {m.parts_replaced}</p>}</li>)}</ul> : <p className="text-ink-500">No maintenance history. Import it from CSV or record it under Maintenance.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Draft maintenance work order">
            <p className="mb-3 text-[13px] text-ink-500">AI drafts from this machine’s recorded history. The draft goes to an approver and cannot be dispatched without sign-off.</p>
            {can(ctx.role, "workorder.draft") ? <ActionForm action={runWorkOrderDraft}><input type="hidden" name="equipment_id" value={id} /><SubmitButton pendingText="Drafting…" className="btn-dark w-full">Draft with AI</SubmitButton></ActionForm> : <p className="text-[13px] text-ink-400">Your role cannot draft work orders.</p>}
            {wos.data?.length ? <ul className="mt-4 space-y-1.5 text-[14px]">{wos.data.map((w) => <li key={w.id}><span className="font-mono text-[12px] text-ink-400">WO-{w.wo_number}</span> {w.title} <Badge tone={w.status === "approved" ? "green" : "amber"}>{w.status.replace("_", " ")}</Badge></li>)}</ul> : null}
          </Card>
          <Card title="Analyse this machine">
            {can(ctx.role, "ai.run") ? <ActionForm action={runDowntimeAnalysis}><input type="hidden" name="equipment_id" value={id} /><input type="hidden" name="days" value="90" /><SubmitButton pendingText="Analysing…" className="btn-ghost w-full">AI downtime analysis (90 days)</SubmitButton></ActionForm> : null}
          </Card>
          <Card title="Confirmed resolutions">
            {res.data?.length ? <ul className="space-y-3 text-[14px]">{res.data.map((r) => <li key={r.id}><p className="font-semibold">{r.original_problem.slice(0, 100)}</p><p className="text-ink-500">{r.resolution.slice(0, 140)}</p><Badge tone={r.verification_status === "verified" ? "green" : r.verification_status === "recurred" ? "red" : "amber"}>{r.verification_status}</Badge></li>)}</ul> : <p className="text-ink-500">None yet. Closed investigations are preserved here.</p>}
          </Card>
          <Card title="Knowledge & documents">
            {kn.data?.length ? <ul className="space-y-2 text-[14px]">{kn.data.map((k) => <li key={k.id}>{k.title} <VerificationBadge level={k.verification} /></li>)}</ul> : <p className="text-ink-500">No knowledge records for this machine yet.</p>}
            {docs.data?.length ? <ul className="mt-3 space-y-1 text-[13px]">{docs.data.map((d) => <li key={d.id}>📄 {d.title} <Badge tone={d.approved ? "green" : "neutral"}>{d.approved ? "approved" : "unapproved"}</Badge></li>)}</ul> : null}
          </Card>
          <Card title="Details">
            <dl className="space-y-2 text-[14px]">{[["Location", e.location], ["Maintenance owner", owner], ["Operating limits", e.operating_limits]].map(([k, v]) => <div key={k}><dt className="text-ink-400">{k}</dt><dd className="font-medium">{v || "Not recorded"}</dd></div>)}</dl>
          </Card>
        </div>
      </div>
      {!events.length && <div className="mt-6"><EmptyState title="No stoppages recorded for this machine" body="Downtime appears here from submitted handovers, manual entries or CSV imports." /></div>}
      {events.length > 0 && <p className="mt-6 text-[12px] text-ink-400">Latest stoppage: {fmt(events[0].started_at)} ({mins(minutesOf(events[0]))}).</p>}
    </>
  );
}
