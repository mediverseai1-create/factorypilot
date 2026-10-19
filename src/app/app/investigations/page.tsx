import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, fmt } from "@/components/ui";
import { createInvestigation, verifyResolution } from "../ops-actions";

export const metadata = { title: "Investigations" };

export default async function Investigations({ searchParams }: { searchParams: Promise<{ new?: string; incident?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  const [{ data: invs }, equipment, people, { data: incs }, { data: res }] = await Promise.all([
    sb.from("investigations").select("id,title,status,equipment_id,owner_id,created_at,confirmed_root_cause").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(60),
    getEquipmentList(sb, ctx.orgId), getPeople(sb, ctx.orgId),
    sb.from("incidents").select("id,title,equipment_id,occurred_at").eq("org_id", ctx.orgId).neq("status", "resolved").order("occurred_at", { ascending: false }).limit(40),
    sb.from("confirmed_resolutions").select("id,original_problem,resolution,verification_status,equipment_id,created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(20),
  ]);
  const eq = nameMap(equipment);
  const tone = { open: "amber", in_progress: "blue", awaiting_confirmation: "amber", closed: "green" } as const;
  return (
    <>
      <PageHeader eyebrow="Incident Investigation" title="Investigations" subtitle="Evidence, possible contributors and hypotheses are kept apart. Only a qualified person can confirm a root cause." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {invs?.length ? (
            <div className="card divide-y divide-canvas-line">{invs.map((i) => (
              <Link key={i.id} href={`/app/investigations/${i.id}`} className="block p-5 hover:bg-canvas-soft">
                <div className="flex flex-wrap items-center gap-2"><p className="text-[16px] font-bold">{i.title}</p><Badge tone={tone[i.status as keyof typeof tone]}>{i.status.replace("_", " ")}</Badge>{i.confirmed_root_cause && <Badge tone="green">Root cause confirmed</Badge>}</div>
                <p className="mt-1 text-[13px] text-ink-400">{i.equipment_id ? eq.get(i.equipment_id) : "No machine"} · {fmt(i.created_at)} · Owner: {people.find((p) => p.id === i.owner_id)?.name ?? "unassigned"}</p>
              </Link>))}</div>
          ) : <EmptyState title="No investigations yet" body="Open one from an incident or a recurring fault. FactoryPilot gathers the machine’s recorded history as evidence; you decide what the root cause is." />}

          <Card title="Resolution outcomes: did the fix hold?">
            {res?.length ? <ul className="divide-y divide-canvas-line">{res.map((r) => (
              <li key={r.id} className="py-3 text-[14px]">
                <p className="font-semibold">{r.original_problem.slice(0, 110)}</p><p className="text-ink-500">{r.resolution.slice(0, 140)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={r.verification_status === "verified" ? "green" : r.verification_status === "recurred" ? "red" : "amber"}>{r.verification_status}</Badge>
                  {r.verification_status === "pending" && can(ctx.role, "investigation.confirm") && (
                    <form action={verifyResolution.bind(null, r.id)} className="flex gap-2"><button name="result" value="verified" className="btn-ghost btn-sm">Fix held</button><button name="result" value="recurred" className="btn-ghost btn-sm">Problem recurred</button></form>)}
                </div></li>))}</ul> : <p className="text-ink-500">Closed investigations appear here so you can mark whether the fix lasted.</p>}
          </Card>
        </div>
        {can(ctx.role, "investigation.run") && (
          <Card title="Open an investigation">
            <ActionForm action={createInvestigation} className="space-y-4">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="field" /></div>
              <div><label className="label" htmlFor="equipment_id">Machine</label><select id="equipment_id" name="equipment_id" defaultValue={sp.new ?? ""} className="field"><option value="">Choose…</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div><label className="label" htmlFor="incident_id">Related incident</label><select id="incident_id" name="incident_id" defaultValue={sp.incident ?? ""} className="field"><option value="">None</option>{incs?.map((i) => <option key={i.id} value={i.id}>{i.title.slice(0, 60)}</option>)}</select></div>
              <div><label className="label" htmlFor="reported_problem">Reported problem</label><textarea id="reported_problem" name="reported_problem" rows={4} required className="field" /></div>
              <div><label className="label" htmlFor="owner_id">Owner</label><select id="owner_id" name="owner_id" defaultValue={ctx.userId} className="field">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <SubmitButton className="btn-dark w-full">Open investigation</SubmitButton>
            </ActionForm>
          </Card>)}
      </div>
    </>
  );
}
