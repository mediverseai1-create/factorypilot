import { updateTask } from "@/app/app/task-actions";
import { Badge, fmt, priorityTone, statusTone } from "@/components/ui";
import Link from "next/link";

type Task = {
  id: string; title: string; detail: string | null; kind: string; priority: string; status: string; owner_id: string | null; due_at: string | null;
  shifts_carried: number; escalated: boolean; equipment_id: string | null; resolution_note?: string | null; source_quote?: string | null;
};
type Person = { id: string; name: string };

/** One follow-up with inline acknowledge / assign / escalate / resolve controls. Server-action driven (no client JS needed). */
export function TaskCard({ t, people, equipmentName, canEdit }: { t: Task; people: Person[]; equipmentName?: string; canEdit: boolean }) {
  const overdue = t.due_at && t.status !== "resolved" && new Date(t.due_at).getTime() < Date.now();
  const bound = updateTask.bind(null, t.id);
  const ownerName = people.find((p) => p.id === t.owner_id)?.name;
  return (
    <li className="rounded-xl border border-canvas-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
        <Badge tone={statusTone(t.status)}>{t.status.replace("_", " ")}</Badge>
        <Badge>{t.kind}</Badge>
        {t.escalated && <Badge tone="red">Escalated</Badge>}
        {overdue && <Badge tone="red">Overdue</Badge>}
        {t.shifts_carried > 0 && <Badge tone="amber">Carried through {t.shifts_carried} handover{t.shifts_carried > 1 ? "s" : ""}</Badge>}
      </div>
      <p className="mt-2 text-[16px] font-bold">{t.title}</p>
      {t.detail && <p className="mt-1 text-[14px] text-ink-500">{t.detail}</p>}
      {t.source_quote && <p className="mt-2 border-l-2 border-amber pl-3 text-[13px] italic text-ink-500">“{t.source_quote}”</p>}
      <p className="mt-2 text-[13px] text-ink-400">
        {equipmentName && t.equipment_id && <><Link className="font-semibold underline" href={`/app/equipment/${t.equipment_id}`}>{equipmentName}</Link> · </>}
        Owner: {ownerName ?? "unassigned"} · Due: {fmt(t.due_at, false)}
      </p>
      {t.status === "resolved" && t.resolution_note && <p className="mt-2 text-[13px] text-signal-green">Resolution: {t.resolution_note}</p>}
      {canEdit && t.status !== "resolved" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-canvas-line pt-3">
          <form action={bound}><input type="hidden" name="status" value="acknowledged" /><button className="btn-ghost btn-sm" disabled={t.status === "acknowledged"}>Acknowledge</button></form>
          <form action={bound}><input type="hidden" name="status" value="awaiting_investigation" /><button className="btn-ghost btn-sm">Needs investigation</button></form>
          <form action={bound} className="flex gap-2">
            <input type="hidden" name="status" value="assigned" />
            <select name="owner_id" aria-label="Assign to" className="field !w-40 !py-1.5 text-sm" defaultValue={t.owner_id ?? ""}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <button className="btn-ghost btn-sm">Assign</button>
          </form>
          {!t.escalated && <form action={bound}><input type="hidden" name="escalate" value="1" /><button className="btn-ghost btn-sm">Escalate</button></form>}
          <form action={bound} className="flex gap-2">
            <input type="hidden" name="status" value="resolved" />
            <input name="resolution_note" aria-label="Resolution note" placeholder="Resolution note" className="field !w-48 !py-1.5 text-sm" required />
            <button className="btn-dark btn-sm">Resolve</button>
          </form>
        </div>
      )}
    </li>
  );
}
