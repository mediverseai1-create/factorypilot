import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { geminiConfigured } from "@/lib/env";
import { getEquipmentList, getPeople, nameMap } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Notice, PageHeader, fmt } from "@/components/ui";
import { TaskCard } from "@/components/task-controls";
import { runBriefing } from "../ops-actions";
import type { Briefing } from "@/lib/ai/schemas";

export const metadata = { title: "Shift Briefings" };

function List({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? <ul className="list-disc space-y-1.5 pl-5 text-[15px]">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-[14px] text-ink-400">{empty}</p>;
}

export default async function Briefings() {
  const ctx = await getCtx();
  const sb = await createClient();
  const [{ data: latest }, { data: tasks }, equipment, people] = await Promise.all([
    sb.from("reports").select("content,created_at").eq("org_id", ctx.orgId).eq("kind", "shift_briefing").order("created_at", { ascending: false }).limit(1),
    sb.from("follow_up_tasks").select("*").eq("org_id", ctx.orgId).neq("status", "resolved").order("priority").order("created_at", { ascending: false }).limit(30),
    getEquipmentList(sb, ctx.orgId), getPeople(sb, ctx.orgId),
  ]);
  const eq = nameMap(equipment);
  const b = latest?.[0]?.content as Briefing | undefined;
  const now = Date.now();
  const needsAck = (tasks ?? []).filter((t) => t.status === "open");
  const overdue = (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  return (
    <>
      <PageHeader eyebrow="Shift Continuity" title="Incoming shift briefing"
        subtitle="Prepared from approved handovers and open issues only. The live list below is always current; the AI narrative is generated on demand and dated."
        actions={can(ctx.role, "ai.run") && (
          <ActionForm action={runBriefing}><SubmitButton pendingText="Preparing briefing…">Generate AI briefing</SubmitButton></ActionForm>)} />
      {!geminiConfigured() && <div className="mb-6"><Notice tone="amber" title="AI not configured">Set GEMINI_API_KEY to generate narrative briefings. The live open-issue lists below work without it.</Notice></div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card><p className="text-[13px] font-semibold text-ink-400">Awaiting acknowledgement</p><p className="mt-1 text-[34px] font-extrabold">{needsAck.length}</p></Card>
        <Card><p className="text-[13px] font-semibold text-ink-400">Overdue</p><p className={`mt-1 text-[34px] font-extrabold ${overdue.length ? "text-signal-red" : ""}`}>{overdue.length}</p></Card>
        <Card><p className="text-[13px] font-semibold text-ink-400">Escalated</p><p className="mt-1 text-[34px] font-extrabold">{(tasks ?? []).filter((t) => t.escalated).length}</p></Card>
      </div>

      {b ? (
        <Card title={`AI briefing · ${fmt(latest![0].created_at)}`} className="mb-6">
          <p className="text-[20px] font-bold leading-snug">{b.headline}</p>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">What happened last shift</h3><List items={b.what_happened} empty="Nothing recorded." /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Unresolved</h3><List items={b.unresolved.map((u) => u.text)} empty="No unresolved items." /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Machines needing attention</h3><List items={b.machines_needing_attention.map((m) => `${m.equipment_ref}: ${m.reason}`)} empty="None identified from the records." /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Overdue</h3><List items={b.overdue} empty="Nothing overdue." /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Recurring</h3><List items={b.recurring.map((r) => r.text)} empty="No recurrence supported by the records." /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Watch for</h3><List items={b.watch_for} empty="—" /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Needs acknowledgement</h3><List items={b.needs_acknowledgement} empty="—" /></section>
            <section><h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-ink-400">Escalations</h3><List items={b.escalations} empty="None." /></section>
          </div>
          {b.limitations.length > 0 && <div className="mt-6"><Notice tone="blue" title="Limitations"><List items={b.limitations} empty="" /></Notice></div>}
        </Card>
      ) : (
        <div className="mb-6"><EmptyState title="No AI briefing generated yet" body="Generate one when a shift starts. It summarises the latest submitted handovers and every open issue, and states what the records cannot tell it." /></div>
      )}

      <Card title="Open issues to act on">
        {tasks?.length ? <ul className="space-y-3">{tasks.map((t) => <TaskCard key={t.id} t={t} people={people} equipmentName={t.equipment_id ? eq.get(t.equipment_id) : undefined} canEdit={can(ctx.role, "followup.update")} />)}</ul>
          : <p className="text-ink-500">No open issues. <Badge tone="green">Clear</Badge></p>}
      </Card>
    </>
  );
}
