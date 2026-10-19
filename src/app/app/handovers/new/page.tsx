import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { createHandover } from "../actions";

export const metadata = { title: "New handover" };

export default async function NewHandover() {
  const ctx = await getCtx();
  if (!can(ctx.role, "capture")) redirect("/app/handovers");
  const sb = await createClient();
  const [{ data: fac }, { data: lines }, { data: shifts }] = await Promise.all([
    sb.from("facilities").select("id,name").eq("org_id", ctx.orgId),
    sb.from("production_lines").select("id,name,facility_id").eq("org_id", ctx.orgId),
    sb.from("shifts").select("id,name,start_time,end_time").eq("org_id", ctx.orgId),
  ]);
  return (
    <>
      <PageHeader title="New handover" subtitle="Choose where and when, then capture your notes. You can paste notes now or record them on the next screen." />
      {!fac?.length ? (
        <EmptyState title="Add a facility first" body="Handovers belong to a facility, line and shift. An administrator can add them in Settings." action={<LinkButton href="/app/settings">Open Settings</LinkButton>} />
      ) : (
        <ActionForm action={createHandover} className="card max-w-3xl space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div><label className="label" htmlFor="facility_id">Facility</label><select id="facility_id" name="facility_id" className="field">{fac.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
            <div><label className="label" htmlFor="line_id">Production line</label><select id="line_id" name="line_id" className="field"><option value="">All / not specified</option>{lines?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div><label className="label" htmlFor="shift_id">Shift</label>
              <select id="shift_id" name="shift_id" className="field" defaultValue="">
                <option value="">Not specified</option>{shifts?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})</option>)}
              </select></div>
            <div><label className="label" htmlFor="shift_date">Shift date</label><input id="shift_date" name="shift_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="field" /></div>
          </div>
          <div><label className="label" htmlFor="notes">Opening notes (optional)</label><textarea id="notes" name="notes" rows={5} className="field" placeholder="Start typing, or leave blank and record a voice note next." /></div>
          <SubmitButton className="btn-primary">Start handover</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
