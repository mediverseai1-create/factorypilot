import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getPeople } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, LinkButton, PageHeader, fmt, statusTone } from "@/components/ui";
import { createEquipment } from "../ops-actions";

export const metadata = { title: "Equipment" };

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ line?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  let q = sb.from("equipment").select("id,name,identifier,equipment_type,status,status_updated_at,line_id,manufacturer,model").eq("org_id", ctx.orgId).order("name").limit(300);
  if (sp.line) q = q.eq("line_id", sp.line);
  if (sp.q) q = q.or(`name.ilike.%${sp.q.replace(/[%,]/g, "")}%,identifier.ilike.%${sp.q.replace(/[%,]/g, "")}%`);
  const [{ data }, { data: lines }, { data: fac }, people, { data: tasks }] = await Promise.all([
    q, sb.from("production_lines").select("id,name,facility_id").eq("org_id", ctx.orgId), sb.from("facilities").select("id,name").eq("org_id", ctx.orgId), getPeople(sb, ctx.orgId),
    sb.from("follow_up_tasks").select("equipment_id").eq("org_id", ctx.orgId).neq("status", "resolved"),
  ]);
  const open = new Map<string, number>();
  tasks?.forEach((t) => t.equipment_id && open.set(t.equipment_id, (open.get(t.equipment_id) ?? 0) + 1));
  const lineName = (id: string | null) => lines?.find((l) => l.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader eyebrow="Equipment registry" title="Equipment" subtitle="Each machine has a contextual intelligence view: history, open issues, recurring faults and confirmed knowledge in one place. Status is as last reported by a person, not live telemetry."
        actions={can(ctx.role, "equipment.manage") && <LinkButton href="/app/data" kind="ghost">Import from CSV</LinkButton>} />
      <form className="mb-5 flex flex-wrap gap-3" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search name or ID" className="field !w-64" aria-label="Search equipment" />
        <select name="line" defaultValue={sp.line ?? ""} className="field !w-56" aria-label="Filter by line"><option value="">All lines</option>{lines?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <button className="btn-dark btn-sm">Filter</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {data?.length ? (
            <div className="card overflow-x-auto"><table className="w-full min-w-[680px]">
              <thead className="border-b border-canvas-line"><tr><th className="th">Machine</th><th className="th">ID</th><th className="th">Line</th><th className="th">Type</th><th className="th">Last reported status</th><th className="th">Open</th></tr></thead>
              <tbody className="divide-y divide-canvas-line">{data.map((e) => (
                <tr key={e.id} className="hover:bg-canvas-soft">
                  <td className="td"><Link href={`/app/equipment/${e.id}`} className="font-bold underline decoration-amber decoration-2 underline-offset-2">{e.name}</Link>{e.manufacturer && <p className="text-[12px] text-ink-400">{e.manufacturer} {e.model}</p>}</td>
                  <td className="td font-mono text-[13px]">{e.identifier}</td><td className="td">{lineName(e.line_id)}</td><td className="td">{e.equipment_type ?? "—"}</td>
                  <td className="td"><Badge tone={statusTone(e.status)}>{e.status}</Badge>{e.status_updated_at && <span className="ml-2 text-[12px] text-ink-400">{fmt(e.status_updated_at, false)}</span>}</td>
                  <td className="td">{open.get(e.id) ?? 0}</td>
                </tr>))}</tbody></table></div>
          ) : <EmptyState title="No equipment registered" body="Register machines one by one, or import your equipment list from CSV. FactoryPilot links handovers and incidents to these records by name or ID." action={<LinkButton href="/app/data">Import equipment list</LinkButton>} />}
        </div>
        {can(ctx.role, "equipment.manage") && (
          <Card title="Register equipment">
            <ActionForm action={createEquipment} className="space-y-4">
              <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required className="field" placeholder="Press 3" /></div>
              <div><label className="label" htmlFor="identifier">Equipment ID</label><input id="identifier" name="identifier" required className="field" placeholder="PR-003" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="equipment_type">Type</label><input id="equipment_type" name="equipment_type" className="field" /></div>
                <div><label className="label" htmlFor="line_id">Line</label><select id="line_id" name="line_id" className="field"><option value="">None</option>{lines?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div><label className="label" htmlFor="manufacturer">Manufacturer</label><input id="manufacturer" name="manufacturer" className="field" /></div>
                <div><label className="label" htmlFor="model">Model</label><input id="model" name="model" className="field" /></div>
              </div>
              <input type="hidden" name="facility_id" value={fac?.[0]?.id ?? ""} />
              <div><label className="label" htmlFor="location">Location</label><input id="location" name="location" className="field" /></div>
              <div><label className="label" htmlFor="operating_limits">Operating limits (as provided)</label><textarea id="operating_limits" name="operating_limits" rows={2} className="field" /></div>
              <div><label className="label" htmlFor="maintenance_owner">Maintenance owner</label><select id="maintenance_owner" name="maintenance_owner" className="field"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <SubmitButton className="btn-dark w-full">Register</SubmitButton>
            </ActionForm>
          </Card>)}
      </div>
    </>
  );
}
