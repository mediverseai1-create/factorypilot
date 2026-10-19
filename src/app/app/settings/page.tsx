import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice, PageHeader } from "@/components/ui";
import { updateProfile } from "../../(auth)/actions";
import { addFacility, addLine, addShift, updateOrgSettings } from "../admin-actions";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const ctx = await getCtx();
  const sb = await createClient();
  const [{ data: org }, { data: fac }, { data: lines }, { data: shifts }, { data: prof }] = await Promise.all([
    sb.from("organizations").select("*").eq("id", ctx.orgId).single(),
    sb.from("facilities").select("id,name,location,timezone").eq("org_id", ctx.orgId),
    sb.from("production_lines").select("id,name,facility_id").eq("org_id", ctx.orgId),
    sb.from("shifts").select("id,name,start_time,end_time").eq("org_id", ctx.orgId),
    sb.from("profiles").select("full_name,job_title").eq("id", ctx.userId).single(),
  ]);
  const admin = can(ctx.role, "settings.manage");
  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Your profile">
          <ActionForm action={updateProfile} className="space-y-4">
            <div><label className="label" htmlFor="full_name">Name</label><input id="full_name" name="full_name" defaultValue={prof?.full_name ?? ""} required className="field" /></div>
            <div><label className="label" htmlFor="job_title">Job title</label><input id="job_title" name="job_title" defaultValue={prof?.job_title ?? ""} className="field" /></div>
            <p className="text-[13px] text-ink-400">Signed in as {ctx.email}.</p>
            <SubmitButton className="btn-dark">Save profile</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Organisation & data retention">
          {admin ? (
            <ActionForm action={updateOrgSettings} className="space-y-4">
              <div><label className="label" htmlFor="name">Organisation name</label><input id="name" name="name" defaultValue={org?.name} required className="field" /></div>
              <div><label className="label" htmlFor="industry">Industry</label><input id="industry" name="industry" defaultValue={org?.industry ?? ""} className="field" /></div>
              <div><label className="label" htmlFor="retention_days">Retention of original shift notes and voice transcripts (days)</label><input id="retention_days" name="retention_days" type="number" min={30} defaultValue={org?.retention_days} className="field" />
                <p className="mt-1 text-[12px] text-ink-400">Approved handover reports, incidents and knowledge are kept. Raw note rows older than this window are removed by the scheduled purge function <code>purge_expired_source_notes()</code>, which must be scheduled (see docs/SETUP.md).</p></div>
              <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" name="require_approval" defaultChecked={org?.require_work_order_approval} className="mt-1 h-5 w-5 accent-amber" />Require supervisor approval before work orders can be approved or dispatched</label>
              <SubmitButton className="btn-dark">Save settings</SubmitButton>
            </ActionForm>
          ) : <Notice tone="blue">Retention: {org?.retention_days} days. Only Plant Managers and above can change organisation settings.</Notice>}
        </Card>

        <Card title="Facilities and production lines">
          <ul className="mb-4 space-y-2 text-[14px]">{fac?.map((f) => <li key={f.id}><b>{f.name}</b> <span className="text-ink-400">{f.location} · {f.timezone}</span><ul className="ml-4 list-disc text-ink-500">{lines?.filter((l) => l.facility_id === f.id).map((l) => <li key={l.id}>{l.name}</li>)}</ul></li>)}{!fac?.length && <li className="text-ink-500">No facilities yet.</li>}</ul>
          {admin && (<div className="space-y-4 border-t border-canvas-line pt-4">
            <ActionForm action={addFacility} className="flex flex-wrap gap-2"><input name="name" required placeholder="New facility" className="field flex-1" aria-label="Facility name" /><input name="timezone" placeholder="Timezone (e.g. Europe/Berlin)" className="field flex-1" aria-label="Timezone" /><SubmitButton className="btn-ghost btn-sm">Add facility</SubmitButton></ActionForm>
            <ActionForm action={addLine} className="flex flex-wrap gap-2"><select name="facility_id" required className="field !w-44" aria-label="Facility"><option value="">Facility…</option>{fac?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select><input name="name" required placeholder="New line" className="field flex-1" aria-label="Line name" /><SubmitButton className="btn-ghost btn-sm">Add line</SubmitButton></ActionForm>
          </div>)}
        </Card>

        <Card title="Shifts">
          <ul className="mb-4 space-y-1 text-[14px]">{shifts?.map((s) => <li key={s.id}><b>{s.name}</b> {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}</li>)}{!shifts?.length && <li className="text-ink-500">No shifts defined.</li>}</ul>
          {admin && (
            <ActionForm action={addShift} className="grid grid-cols-2 gap-2 border-t border-canvas-line pt-4">
              <input name="name" required placeholder="Shift name" className="field col-span-2" aria-label="Shift name" />
              <select name="facility_id" className="field col-span-2" aria-label="Facility"><option value="">All facilities</option>{fac?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <input name="start_time" type="time" required className="field" aria-label="Start" /><input name="end_time" type="time" required className="field" aria-label="End" />
              <SubmitButton className="btn-ghost btn-sm col-span-2">Add shift</SubmitButton>
            </ActionForm>)}
        </Card>
      </div>
    </>
  );
}
