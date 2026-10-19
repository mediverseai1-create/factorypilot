import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { TaskCard } from "@/components/task-controls";
import { createTask } from "../task-actions";

export const metadata = { title: "Actions & Follow-ups" };

export default async function Actions({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "open" } = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  let q = sb.from("follow_up_tasks").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(100);
  q = view === "resolved" ? q.eq("status", "resolved") : q.neq("status", "resolved");
  const [{ data: tasks }, equipment, people] = await Promise.all([q, getEquipmentList(sb, ctx.orgId), getPeople(sb, ctx.orgId)]);
  const eq = nameMap(equipment);
  const list = view === "overdue" ? (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now()) : tasks ?? [];
  return (
    <>
      <PageHeader eyebrow="Shift Continuity" title="Actions & follow-ups" subtitle="Acknowledge, assign, escalate or resolve. Resolving closes the item but keeps it in the permanent record." />
      <div className="mb-6 flex gap-2">
        {[["open", "Open"], ["overdue", "Overdue"], ["resolved", "Resolved"]].map(([v, l]) => (
          <a key={v} href={`?view=${v}`} className={`btn-sm ${view === v ? "btn-dark" : "btn-ghost"}`}>{l}</a>))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>{list.length ? <ul className="space-y-3">{list.map((t) => <TaskCard key={t.id} t={t} people={people} equipmentName={t.equipment_id ? eq.get(t.equipment_id) : undefined} canEdit={can(ctx.role, "followup.update")} />)}</ul>
          : <EmptyState title={view === "resolved" ? "Nothing resolved yet" : "No items here"} body="Items arrive automatically when a handover is submitted, or you can add one manually." />}</div>
        {can(ctx.role, "followup.update") && (
          <Card title="Add a follow-up">
            <ActionForm action={createTask} className="space-y-4">
              <div><label className="label" htmlFor="title">Title</label><input id="title" name="title" required className="field" /></div>
              <div><label className="label" htmlFor="detail">Detail</label><textarea id="detail" name="detail" rows={3} className="field" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="kind">Type</label><select id="kind" name="kind" className="field">{["issue", "maintenance", "safety", "quality", "material", "inspection", "corrective", "other"].map((k) => <option key={k}>{k}</option>)}</select></div>
                <div><label className="label" htmlFor="priority">Priority</label><select id="priority" name="priority" defaultValue="medium" className="field">{["low", "medium", "high", "critical"].map((k) => <option key={k}>{k}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="equipment_id">Machine</label><select id="equipment_id" name="equipment_id" className="field"><option value="">None</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div><label className="label" htmlFor="owner_id">Owner</label><select id="owner_id" name="owner_id" className="field"><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="label" htmlFor="due_at">Due</label><input id="due_at" name="due_at" type="datetime-local" className="field" /></div>
              <SubmitButton className="btn-dark w-full">Add follow-up</SubmitButton>
            </ActionForm>
          </Card>)}
      </div>
    </>
  );
}
