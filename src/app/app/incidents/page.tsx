import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList, nameMap } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Notice, PageHeader, fmt, priorityTone, statusTone } from "@/components/ui";
import { createIncident, setIncidentStatus } from "../ops-actions";

export const metadata = { title: "Incident Log" };

export default async function Incidents({ searchParams }: { searchParams: Promise<{ status?: string; equipment?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  let q = sb.from("incidents").select("*").eq("org_id", ctx.orgId).order("occurred_at", { ascending: false }).limit(100);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.equipment) q = q.eq("equipment_id", sp.equipment);
  const [{ data }, equipment] = await Promise.all([q, getEquipmentList(sb, ctx.orgId)]);
  const eq = nameMap(equipment);
  return (
    <>
      <PageHeader eyebrow="Incident Log" title="Incidents" subtitle="Faults, safety observations, quality and material issues. Incidents from submitted handovers are added automatically." />
      <div className="mb-4"><Notice tone="red" title="Safety-critical events">Emergencies and safety-critical events must follow your site’s established escalation procedure. Logging an incident here does not notify anyone.</Notice></div>
      <div className="mb-5 flex flex-wrap gap-2">
        {[["", "All"], ["open", "Open"], ["investigating", "Investigating"], ["resolved", "Resolved"]].map(([v, l]) => (<Link key={v} href={v ? `?status=${v}` : "?"} className={`btn-sm ${(sp.status ?? "") === v ? "btn-dark" : "btn-ghost"}`}>{l}</Link>))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {data?.length ? (
            <div className="card overflow-x-auto"><table className="w-full min-w-[760px]">
              <thead className="border-b border-canvas-line"><tr><th className="th">When</th><th className="th">Machine</th><th className="th">Incident</th><th className="th">Severity</th><th className="th">Status</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-canvas-line">{data.map((i) => (
                <tr key={i.id}>
                  <td className="td whitespace-nowrap">{fmt(i.occurred_at)}</td>
                  <td className="td">{i.equipment_id ? <Link className="font-semibold underline" href={`/app/equipment/${i.equipment_id}`}>{eq.get(i.equipment_id)}</Link> : "—"}</td>
                  <td className="td"><p className="font-semibold">{i.title}</p>{i.description && <p className="text-[13px] text-ink-500">{i.description.slice(0, 160)}</p>}{i.fault_code && <p className="font-mono text-[12px] text-ink-400">{i.fault_code}</p>}<Badge>{i.category}</Badge></td>
                  <td className="td"><Badge tone={priorityTone(i.severity)}>{i.severity}</Badge></td>
                  <td className="td"><Badge tone={statusTone(i.status)}>{i.status}</Badge></td>
                  <td className="td">{can(ctx.role, "capture") && i.status !== "resolved" && (
                    <form action={setIncidentStatus.bind(null, i.id)}><input type="hidden" name="status" value="resolved" /><button className="btn-ghost btn-sm">Mark resolved</button></form>)}</td>
                </tr>))}</tbody></table></div>
          ) : <EmptyState title="No incidents recorded" body="Log a fault or observation, or submit a handover. Machine events in handovers become incidents automatically." />}
        </div>
        {can(ctx.role, "capture") && (
          <Card title="Log an incident">
            <ActionForm action={createIncident} className="space-y-4">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="field" /></div>
              <div><label className="label" htmlFor="description">What happened</label><textarea id="description" name="description" rows={3} className="field" /></div>
              <div><label className="label" htmlFor="equipment_id">Machine</label><select id="equipment_id" name="equipment_id" className="field"><option value="">Not machine-specific</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="category">Category</label><select id="category" name="category" className="field">{["fault", "safety", "quality", "material", "process", "other"].map((k) => <option key={k}>{k}</option>)}</select></div>
                <div><label className="label" htmlFor="severity">Severity</label><select id="severity" name="severity" defaultValue="medium" className="field">{["low", "medium", "high", "critical"].map((k) => <option key={k}>{k}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="fault_code">Fault code</label><input id="fault_code" name="fault_code" className="field" /></div>
                <div><label className="label" htmlFor="shift_label">Shift</label><input id="shift_label" name="shift_label" className="field" /></div>
              </div>
              <div><label className="label" htmlFor="occurred_at">Occurred at (default now)</label><input id="occurred_at" name="occurred_at" type="datetime-local" className="field" /></div>
              <SubmitButton className="btn-dark w-full">Log incident</SubmitButton>
            </ActionForm>
          </Card>)}
      </div>
    </>
  );
}
