/** Deterministic downtime statistics. Computed from stored events only: no AI, no extrapolation. */
export type DtEvent = {
  id: string; equipment_id: string | null; started_at: string; ended_at: string | null; duration_minutes: number | null;
  fault_code: string | null; shift_label: string | null; context: string | null; cause_category: string | null;
};

export const minutesOf = (e: Pick<DtEvent, "started_at" | "ended_at" | "duration_minutes">): number | null => {
  if (e.duration_minutes != null) return Number(e.duration_minutes);
  if (e.ended_at) {
    const m = (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000;
    return m >= 0 ? m : null;
  }
  return null;
};

export type DowntimeStats = {
  total: number; withDuration: number; totalMinutes: number;
  byEquipment: { id: string; count: number; minutes: number }[];
  byFault: { code: string; count: number; equipmentIds: string[] }[];
  byShift: { shift: string; count: number; minutes: number }[];
  byHour: number[];
  recurring: { equipmentId: string; faultCode: string | null; count: number; eventIds: string[] }[];
  contextRepeats: { equipmentId: string; context: string; count: number; eventIds: string[] }[];
};

const normCtx = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function computeStats(events: DtEvent[], recurringThreshold = 3): DowntimeStats {
  const eq = new Map<string, { count: number; minutes: number }>();
  const fault = new Map<string, { count: number; eq: Set<string> }>();
  const shift = new Map<string, { count: number; minutes: number }>();
  const byHour = Array<number>(24).fill(0);
  const rec = new Map<string, { equipmentId: string; faultCode: string | null; ids: string[] }>();
  const ctx = new Map<string, { equipmentId: string; context: string; ids: string[] }>();
  let totalMinutes = 0, withDuration = 0;

  for (const e of events) {
    const m = minutesOf(e);
    if (m != null) { totalMinutes += m; withDuration++; }
    byHour[new Date(e.started_at).getUTCHours()]++;
    if (e.equipment_id) {
      const x = eq.get(e.equipment_id) ?? { count: 0, minutes: 0 };
      x.count++; x.minutes += m ?? 0; eq.set(e.equipment_id, x);
      const key = `${e.equipment_id}|${e.fault_code ?? ""}`;
      const r = rec.get(key) ?? { equipmentId: e.equipment_id, faultCode: e.fault_code, ids: [] };
      r.ids.push(e.id); rec.set(key, r);
      if (e.context && normCtx(e.context)) {
        const ck = `${e.equipment_id}|${normCtx(e.context)}`;
        const c = ctx.get(ck) ?? { equipmentId: e.equipment_id, context: e.context, ids: [] };
        c.ids.push(e.id); ctx.set(ck, c);
      }
    }
    if (e.fault_code) {
      const f = fault.get(e.fault_code) ?? { count: 0, eq: new Set<string>() };
      f.count++; if (e.equipment_id) f.eq.add(e.equipment_id); fault.set(e.fault_code, f);
    }
    if (e.shift_label) {
      const s = shift.get(e.shift_label) ?? { count: 0, minutes: 0 };
      s.count++; s.minutes += m ?? 0; shift.set(e.shift_label, s);
    }
  }
  return {
    total: events.length, withDuration, totalMinutes,
    byEquipment: [...eq].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count),
    byFault: [...fault].map(([code, v]) => ({ code, count: v.count, equipmentIds: [...v.eq] })).sort((a, b) => b.count - a.count),
    byShift: [...shift].map(([s, v]) => ({ shift: s, ...v })).sort((a, b) => b.count - a.count),
    byHour,
    recurring: [...rec.values()].filter((r) => r.ids.length >= recurringThreshold).map((r) => ({ equipmentId: r.equipmentId, faultCode: r.faultCode, count: r.ids.length, eventIds: r.ids })).sort((a, b) => b.count - a.count),
    contextRepeats: [...ctx.values()].filter((c) => c.ids.length >= 2).map((c) => ({ equipmentId: c.equipmentId, context: c.context, count: c.ids.length, eventIds: c.ids })).sort((a, b) => b.count - a.count),
  };
}
