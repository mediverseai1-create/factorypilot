import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Stat, fmt, mins, statusTone } from "@/components/ui";
import { TaskCard } from "@/components/task-controls";
import { HBarChart } from "@/components/charts";
import { minutesOf } from "@/lib/downtime";

export const metadata = { title: "Overview" };
const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString();

export default async function Overview() {
  const ctx = await getCtx();
  const sb = await createClient();
  const o = ctx.orgId;
  const [equipment, people, lastH, tasks, dt, wos, res, kn, brief, handoversPending] = await Promise.all([
    getEquipmentList(sb, o), getPeople(sb, o),
    sb.from("handovers").select("id,shift_label,shift_date,submitted_at,status,report").eq("org_id", o).in("status", ["submitted", "acknowledged"]).order("submitted_at", { ascending: false }).limit(4),
    sb.from("follow_up_tasks").select("*").eq("org_id", o).neq("status", "resolved").order("created_at", { ascending: false }).limit(60),
    sb.from("downtime_events").select("id,equipment_id,started_at,ended_at,duration_minutes,fault_code,shift_label,context,cause_category").eq("org_id", o).gte("started_at", ago(30)),
    sb.from("work_orders").select("id,wo_number,title,priority,equipment_id,status").eq("org_id", o).eq("status", "pending_approval").limit(6),
    sb.from("confirmed_resolutions").select("id,original_problem,resolution,equipment_id,verification_status,created_at").eq("org_id", o).order("created_at", { ascending: false }).limit(4),
    sb.from("knowledge_records").select("id", { count: "exact", head: true }).eq("org_id", o).gte("created_at", ago(7)),
    sb.from("reports").select("created_at").eq("org_id", o).eq("kind", "shift_briefing").order("created_at", { ascending: false }).limit(1),
    sb.from("handovers").select("id", { count: "exact", head: true }).eq("org_id", o).eq("status", "submitted"),
  ]);
  const eq = nameMap(equipment);
  const open = tasks.data ?? [];
  const now = Date.now();
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const escalated = open.filter((t) => t.escalated);
  const downtime = dt.data ?? [];
  const byEq = new Map<string, number>();
  downtime.forEach((e) => { const m = minutesOf(e); if (e.equipment_id && m) byEq.set(e.equipment_id, (byEq.get(e.equipment_id) ?? 0) + m); });
  const chart = [...byEq].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => ({ name: eq.get(id) ?? "Unknown", value: Math.round(v) }));
  const counts = new Map<string, number>();
  open.forEach((t) => t.equipment_id && counts.set(t.equipment_id, (counts.get(t.equipment_id) ?? 0) + 1));
  const attention = equipment.filter((e) => e.status === "stopped" || e.status === "degraded" || counts.has(e.id))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, 6);
  const since = brief.data?.[0]?.created_at;
  const fresh = since ? (lastH.data ?? []).filter((h) => h.submitted_at && h.submitted_at > since).length : null;
  const empty = !equipment.length && !lastH.data?.length && !open.length && !downtime.length;
  const latest = lastH.data?.[0];
  const rep = latest?.report as { summary?: string } | null;

  return (
    <>
      <PageHeader eyebrow={ctx.orgName} title="Operations overview" subtitle="Everything shown here comes from your submitted handovers and recorded events. Nothing is estimated or pre-filled."
        actions={<>{can(ctx.role, "capture") && <LinkButton href="/app/handovers/new">New handover</LinkButton>}<LinkButton href="/app/briefings" kind="ghost">Shift briefing</LinkButton></>} />

      {empty && (
        <div className="mb-8"><EmptyState title="Set up your plant to see live operational intelligence"
          body="Register or import your equipment, then record your first shift handover. Open issues, recurring faults and downtime patterns appear here as real records accumulate."
          action={<div className="flex flex-wrap gap-3"><LinkButton href="/app/data">Import equipment (CSV)</LinkButton><LinkButton href="/app/equipment" kind="ghost">Register equipment</LinkButton><LinkButton href="/app/handovers/new" kind="ghost">Start a handover</LinkButton></div>} /></div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open issues" value={open.length} hint={`${escalated.length} escalated`} tone={escalated.length ? "red" : undefined} />
        <Stat label="Overdue follow-ups" value={overdue.length} tone={overdue.length ? "red" : undefined} />
        <Stat label="Work orders awaiting approval" value={wos.data?.length ?? 0} tone={wos.data?.length ? "amber" : undefined} />
        <Stat label="Handovers awaiting acknowledgement" value={handoversPending.count ?? 0} tone={handoversPending.count ? "amber" : undefined} />
      </div>
      {fresh != null && <p className="mt-3 text-[13px] text-ink-400">Since the last generated briefing ({fmt(since)}): {fresh} new submitted handover(s).</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Last shift" action={latest && <Link className="text-[14px] font-semibold underline" href={`/app/handovers/${latest.id}`}>Open handover</Link>}>
            {latest ? (<><p className="text-[13px] text-ink-400">{latest.shift_label ?? "Shift"} · {latest.shift_date} · <Badge tone={latest.status === "acknowledged" ? "green" : "amber"}>{latest.status}</Badge></p>
              <p className="mt-2 text-[16px] leading-relaxed">{rep?.summary ?? "No summary stored."}</p></>) : <p className="text-ink-500">No submitted handovers yet.</p>}
          </Card>

          <Card title="Open issues" action={<Link className="text-[14px] font-semibold underline" href="/app/actions">All follow-ups</Link>}>
            {open.length ? <ul className="space-y-3">{open.slice(0, 5).map((t) => <TaskCard key={t.id} t={t} people={people} equipmentName={t.equipment_id ? eq.get(t.equipment_id) : undefined} canEdit={can(ctx.role, "followup.update")} />)}</ul>
              : <p className="text-ink-500">No open issues. Unresolved items from submitted handovers will appear here.</p>}
          </Card>

          <Card title="Recorded downtime, last 30 days (minutes by machine)">
            {chart.length ? <HBarChart data={chart} unit="min" /> : <p className="text-ink-500">No downtime with a recorded duration yet. Add events manually or import a CSV in Data &amp; Integrations.</p>}
            <p className="mt-3 text-[12px] text-ink-400">{downtime.length} event(s) recorded; only events with a duration or end time contribute to minutes.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Equipment attention list" action={<Link className="text-[14px] font-semibold underline" href="/app/equipment">Registry</Link>}>
            {attention.length ? <ul className="divide-y divide-canvas-line">{attention.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2.5">
                <Link href={`/app/equipment/${e.id}`} className="font-semibold underline decoration-amber decoration-2 underline-offset-2">{e.name}</Link>
                <span className="flex items-center gap-2 text-[13px]">{counts.get(e.id) ? <span className="text-ink-400">{counts.get(e.id)} open</span> : null}<Badge tone={statusTone(e.status)}>{e.status}</Badge></span>
              </li>))}</ul> : <p className="text-ink-500">No machines flagged. Status is the last value reported by a person; it is not live telemetry.</p>}
          </Card>
          <Card title="Pending work orders" action={<Link className="text-[14px] font-semibold underline" href="/app/maintenance">Review</Link>}>
            {wos.data?.length ? <ul className="space-y-2 text-[14px]">{wos.data.map((w) => <li key={w.id}><span className="font-mono text-[12px] text-ink-400">WO-{w.wo_number}</span> {w.title} <Badge tone={w.priority === "critical" ? "red" : "neutral"}>{w.priority}</Badge></li>)}</ul> : <p className="text-ink-500">Nothing awaiting approval.</p>}
          </Card>
          <Card title="Recent resolutions">
            {res.data?.length ? <ul className="space-y-3 text-[14px]">{res.data.map((r) => <li key={r.id}><p className="font-semibold">{r.original_problem.slice(0, 80)}</p><p className="text-ink-500">{r.resolution.slice(0, 100)}</p><Badge tone={r.verification_status === "verified" ? "green" : r.verification_status === "recurred" ? "red" : "amber"}>{r.verification_status}</Badge></li>)}</ul> : <p className="text-ink-500">Closed investigations will be preserved here.</p>}
          </Card>
          <Card title="Knowledge base activity"><p className="text-[28px] font-extrabold">{kn.count ?? 0}</p><p className="text-[13px] text-ink-400">records added in the last 7 days</p>
            <Link className="mt-3 inline-block text-[14px] font-semibold underline" href="/app/knowledge">Search the knowledge base</Link></Card>
          {downtime.length > 0 && <p className="text-[12px] text-ink-400">Total recorded downtime (30 d): {mins([...byEq.values()].reduce((a, b) => a + b, 0))}</p>}
        </div>
      </div>
    </>
  );
}
