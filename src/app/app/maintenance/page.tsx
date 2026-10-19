import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Notice, PageHeader, fmt, priorityTone } from "@/components/ui";
import { advanceWorkOrder, createMaintenance, createWorkOrder, decideWorkOrder, runWorkOrderDraft } from "../ops-actions";

export const metadata = { title: "Maintenance & Work Orders" };

const NEXT: Record<string, [string, string][]> = {
  approved: [["dispatched", "Dispatch"]], dispatched: [["in_progress", "Start work"]], in_progress: [["completed", "Mark complete"]],
  draft: [["pending_approval", "Submit for approval"]],
};

export default async function Maintenance() {
  const ctx = await getCtx();
  const sb = await createClient();
  const [{ data: wos }, { data: mt }, equipment, people] = await Promise.all([
    sb.from("work_orders").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(60),
    sb.from("maintenance_records").select("id,equipment_id,performed_at,action_type,description,outcome,parts_replaced,performed_by").eq("org_id", ctx.orgId).order("performed_at", { ascending: false }).limit(30),
    getEquipmentList(sb, ctx.orgId), getPeople(sb, ctx.orgId),
  ]);
  const eq = nameMap(equipment);
  const pending = wos?.filter((w) => w.status === "pending_approval") ?? [];
  const rest = wos?.filter((w) => w.status !== "pending_approval") ?? [];
  const approver = can(ctx.role, "workorder.approve");
  const WO = ({ w }: { w: NonNullable<typeof wos>[number] }) => (
    <li className="rounded-xl border border-canvas-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-ink-400">WO-{w.wo_number}</span>
        <Badge tone={priorityTone(w.priority)}>{w.priority}</Badge>
        <Badge tone={w.status === "approved" || w.status === "completed" ? "green" : w.status === "rejected" ? "red" : "amber"}>{w.status.replace("_", " ")}</Badge>
        {w.ai_drafted && <Badge tone="blue">AI-drafted: review required</Badge>}
      </div>
      <p className="mt-2 text-[17px] font-bold">{w.title}</p>
      <p className="text-[13px] text-ink-400">{w.equipment_id && <Link className="font-semibold underline" href={`/app/equipment/${w.equipment_id}`}>{eq.get(w.equipment_id)}</Link>} · {fmt(w.created_at)} · Owner: {people.find((p) => p.id === w.assigned_to)?.name ?? w.assigned_team ?? "unassigned"}{w.approved_by && ` · Approved by ${people.find((p) => p.id === w.approved_by)?.name ?? "approver"} ${fmt(w.approved_at)}`}</p>
      <dl className="mt-3 space-y-2 text-[14px]">
        {([["Reported symptoms", w.symptoms], ["Incident history", w.incident_history], ["Actions already attempted", w.attempted_actions], ["Recommended inspection", w.recommended_inspection]] as const).map(([k, v]) => v ? <div key={k}><dt className="font-semibold text-ink-400">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div> : null)}
      </dl>
      {w.safety_notice && <p className="mt-3 rounded-lg bg-signal-redbg px-3 py-2 text-[13px] text-signal-red">⚠ {w.safety_notice}</p>}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-canvas-line pt-3">
        {w.status === "pending_approval" && approver && (
          <form action={decideWorkOrder.bind(null, w.id)} className="flex flex-wrap gap-2">
            <input name="comment" placeholder="Comment (optional)" className="field !w-56 !py-1.5 text-sm" />
            <button name="decision" value="approved" className="btn-dark btn-sm">Approve</button>
            <button name="decision" value="rejected" className="btn-ghost btn-sm">Reject</button>
          </form>)}
        {w.status === "pending_approval" && !approver && <span className="text-[13px] text-ink-400">Awaiting an authorised approver (Shift Supervisor or above).</span>}
        {NEXT[w.status]?.filter(() => (w.status === "approved" ? approver : true)).map(([s, label]) => (
          <form key={s} action={advanceWorkOrder.bind(null, w.id)}><input type="hidden" name="status" value={s} /><button className="btn-ghost btn-sm">{label}</button></form>))}
      </div>
    </li>
  );
  return (
    <>
      <PageHeader eyebrow="Maintenance Intelligence" title="Maintenance & work orders" subtitle="Drafts are assembled from recorded history. Nothing is dispatched until an authorised person approves it." />
      <div className="mb-6"><Notice tone="blue" title="Human approval required">AI-drafted work orders are suggestions to investigate, not authorisations. Hazardous work must follow your site’s lockout/tagout and permit-to-work procedures.</Notice></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card title={`Awaiting approval (${pending.length})`}>{pending.length ? <ul className="space-y-4">{pending.map((w) => <WO key={w.id} w={w} />)}</ul> : <p className="text-ink-500">Nothing awaiting approval.</p>}</Card>
          <Card title="Other work orders">{rest.length ? <ul className="space-y-4">{rest.map((w) => <WO key={w.id} w={w} />)}</ul> : <p className="text-ink-500">No other work orders.</p>}</Card>
          <Card title="Maintenance history">
            {mt?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px]"><thead><tr><th className="th">Date</th><th className="th">Machine</th><th className="th">Work</th><th className="th">Outcome</th></tr></thead>
              <tbody className="divide-y divide-canvas-line">{mt.map((m) => <tr key={m.id}><td className="td whitespace-nowrap">{fmt(m.performed_at, false)}</td><td className="td">{m.equipment_id ? eq.get(m.equipment_id) : "—"}</td><td className="td"><p className="font-semibold">{m.action_type}</p><p className="text-ink-500">{m.description}</p>{m.parts_replaced && <p className="text-[12px] text-ink-400">Parts: {m.parts_replaced}</p>}</td><td className="td"><Badge tone={m.outcome === "resolved" ? "green" : m.outcome === "not_resolved" ? "red" : "neutral"}>{m.outcome}</Badge></td></tr>)}</tbody></table></div>
              : <EmptyState title="No maintenance history" body="Record interventions as they happen or import your history from CSV. Repeated interventions and failed fixes feed recurring-fault analysis." />}
          </Card>
        </div>
        <div className="space-y-6">
          {can(ctx.role, "workorder.draft") && (
            <Card title="Draft a work order with AI">
              <ActionForm action={runWorkOrderDraft} className="space-y-3">
                <select name="equipment_id" required className="field" aria-label="Machine"><option value="">Choose machine…</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <SubmitButton pendingText="Drafting…" className="btn-primary w-full">Draft from history</SubmitButton>
              </ActionForm>
            </Card>)}
          {can(ctx.role, "workorder.draft") && (
            <Card title="Create manually">
              <ActionForm action={createWorkOrder} className="space-y-3">
                <input name="title" required placeholder="Title" className="field" aria-label="Title" />
                <select name="equipment_id" className="field" aria-label="Machine"><option value="">Machine…</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <textarea name="symptoms" rows={2} placeholder="Reported symptoms" className="field" />
                <textarea name="recommended_inspection" rows={2} placeholder="Recommended inspection" className="field" />
                <div className="grid grid-cols-2 gap-3"><select name="priority" defaultValue="medium" className="field" aria-label="Priority">{["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}</select><input name="assigned_team" placeholder="Team" className="field" /></div>
                <SubmitButton className="btn-dark w-full">Submit for approval</SubmitButton>
              </ActionForm>
            </Card>)}
          {can(ctx.role, "equipment.manage") && (
            <Card title="Record maintenance performed">
              <ActionForm action={createMaintenance} className="space-y-3">
                <select name="equipment_id" required className="field" aria-label="Machine"><option value="">Machine…</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <input name="action_type" placeholder="Action type (e.g. bearing replacement)" className="field" />
                <textarea name="description" required rows={3} placeholder="What was done" className="field" />
                <input name="parts_replaced" placeholder="Parts replaced" className="field" />
                <div className="grid grid-cols-2 gap-3"><select name="outcome" defaultValue="unknown" className="field" aria-label="Outcome">{["resolved", "partial", "not_resolved", "unknown"].map((p) => <option key={p}>{p}</option>)}</select><input name="duration_minutes" type="number" min={0} placeholder="Minutes" className="field" /></div>
                <input name="performed_by" placeholder="Technician" className="field" />
                <input name="performed_at" type="datetime-local" className="field" aria-label="Performed at" />
                <SubmitButton className="btn-dark w-full">Save record</SubmitButton>
              </ActionForm>
            </Card>)}
        </div>
      </div>
    </>
  );
}
