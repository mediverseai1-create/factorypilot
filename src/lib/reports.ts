import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeStats, minutesOf, type DtEvent } from "@/lib/downtime";

export const REPORT_KINDS = {
  shift_handover: "Shift Handover Report",
  daily_briefing: "Daily Operations Briefing",
  downtime: "Equipment Downtime Report",
  recurring_faults: "Recurring Fault Report",
  maintenance_activity: "Maintenance Activity Report",
  open_issues: "Open Issues Report",
  investigations: "Incident Investigation Report",
  continuity: "Shift Continuity Report",
  knowledge_activity: "Knowledge Base Activity Report",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS;

export type ReportContent = {
  title: string; period: { start: string; end: string }; generated_at: string;
  sections: { heading: string; columns?: string[]; rows?: (string | number)[][]; bullets?: string[] }[];
  limitations: string[]; record_count: number;
};

const d = (s?: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");
const m = (x: number | null) => (x == null ? "—" : `${Math.round(x)} min`);

/** Reports are built only from stored records; every report states its period, record count and limitations. */
export async function buildReport(orgId: string, kind: ReportKind, days: number): Promise<ReportContent> {
  const sb = await createClient();
  const end = new Date(), start = new Date(Date.now() - days * 864e5);
  const s = start.toISOString();
  const { data: eqs } = await sb.from("equipment").select("id,name").eq("org_id", orgId);
  const en = (id: string | null) => eqs?.find((e) => e.id === id)?.name ?? "—";
  const sections: ReportContent["sections"] = [];
  const limitations: string[] = ["Reflects only records entered or imported into FactoryPilot. Missing records are not inferred."];
  let count = 0;

  if (kind === "shift_handover" || kind === "daily_briefing") {
    const { data } = await sb.from("handovers").select("shift_label,shift_date,status,submitted_at,report").eq("org_id", orgId).in("status", ["submitted", "acknowledged"]).gte("submitted_at", s).order("submitted_at", { ascending: false });
    count = data?.length ?? 0;
    sections.push({ heading: "Submitted handovers", columns: ["Shift", "Date", "Status", "Summary"], rows: (data ?? []).map((h) => [h.shift_label ?? "—", h.shift_date, h.status, (h.report as { summary?: string } | null)?.summary ?? "—"]) });
    if (kind === "daily_briefing") {
      const { data: t } = await sb.from("follow_up_tasks").select("title,priority,status,due_at,equipment_id,escalated").eq("org_id", orgId).neq("status", "resolved").order("priority");
      sections.push({ heading: "Open issues", columns: ["Issue", "Machine", "Priority", "Status", "Due", "Escalated"], rows: (t ?? []).map((x) => [x.title, en(x.equipment_id), x.priority, x.status, d(x.due_at), x.escalated ? "Yes" : "No"]) });
      count += t?.length ?? 0;
    }
  }
  if (kind === "downtime" || kind === "recurring_faults") {
    const { data } = await sb.from("downtime_events").select("id,equipment_id,started_at,ended_at,duration_minutes,fault_code,shift_label,context,cause_category").eq("org_id", orgId).gte("started_at", s);
    const st = computeStats((data ?? []) as DtEvent[]);
    count = st.total;
    if (kind === "downtime") {
      sections.push({ heading: "Summary", bullets: [`${st.total} stoppage(s) recorded`, `${m(st.withDuration ? st.totalMinutes : null)} recorded downtime across ${st.withDuration} event(s) that have a duration`] });
      sections.push({ heading: "By machine", columns: ["Machine", "Stoppages", "Recorded minutes"], rows: st.byEquipment.map((x) => [en(x.id), x.count, Math.round(x.minutes)]) });
      sections.push({ heading: "By shift", columns: ["Shift", "Stoppages", "Recorded minutes"], rows: st.byShift.map((x) => [x.shift, x.count, Math.round(x.minutes)]) });
      limitations.push(`${st.total - st.withDuration} event(s) have no duration and are excluded from minute totals.`, "No savings, cost or predictive-accuracy figures are produced.");
    } else {
      sections.push({ heading: "Recurring faults (same machine + fault code, 3 or more)", columns: ["Machine", "Fault code", "Occurrences"], rows: st.recurring.map((r) => [en(r.equipmentId), r.faultCode ?? "none recorded", r.count]) });
      sections.push({ heading: "Repeated operating context (2 or more)", columns: ["Machine", "Context", "Occurrences"], rows: st.contextRepeats.map((r) => [en(r.equipmentId), r.context, r.count]) });
      limitations.push("Thresholds: 3+ events for recurring faults; 2+ for repeated context. Correlation does not establish cause.");
    }
  }
  if (kind === "maintenance_activity") {
    const { data } = await sb.from("maintenance_records").select("equipment_id,performed_at,action_type,description,outcome,parts_replaced,duration_minutes").eq("org_id", orgId).gte("performed_at", s).order("performed_at", { ascending: false });
    count = data?.length ?? 0;
    sections.push({ heading: "Maintenance records", columns: ["Date", "Machine", "Action", "Description", "Outcome", "Parts"], rows: (data ?? []).map((x) => [d(x.performed_at), en(x.equipment_id), x.action_type ?? "—", x.description, x.outcome, x.parts_replaced ?? "—"]) });
    const byEq = new Map<string, number>(); data?.forEach((x) => x.equipment_id && byEq.set(x.equipment_id, (byEq.get(x.equipment_id) ?? 0) + 1));
    sections.push({ heading: "Repeated interventions (2+)", columns: ["Machine", "Interventions"], rows: [...byEq].filter(([, n]) => n > 1).map(([id, n]) => [en(id), n]) });
    const { data: wo } = await sb.from("work_orders").select("created_at,completed_at,status").eq("org_id", orgId).eq("status", "completed").gte("created_at", s);
    const times = (wo ?? []).filter((w) => w.completed_at).map((w) => (new Date(w.completed_at!).getTime() - new Date(w.created_at).getTime()) / 60000);
    sections.push({ heading: "Work-order resolution time", bullets: [times.length ? `${times.length} completed; median ${m(times.sort((a, b) => a - b)[Math.floor(times.length / 2)])}` : "No completed work orders in period"] });
  }
  if (kind === "open_issues" || kind === "continuity") {
    const { data } = await sb.from("follow_up_tasks").select("title,kind,priority,status,equipment_id,due_at,shifts_carried,escalated,created_at,resolved_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(500);
    const open = (data ?? []).filter((t) => t.status !== "resolved");
    count = data?.length ?? 0;
    sections.push({ heading: "Open items", columns: ["Issue", "Machine", "Type", "Priority", "Status", "Handovers carried", "Due"], rows: open.map((t) => [t.title, en(t.equipment_id), t.kind, t.priority, t.status, t.shifts_carried, d(t.due_at)]) });
    if (kind === "continuity") {
      const res = (data ?? []).filter((t) => t.resolved_at && t.resolved_at >= s);
      sections.push({ heading: "Continuity summary", bullets: [`${open.filter((t) => t.shifts_carried > 0).length} open item(s) carried over at least one shift`, `${open.filter((t) => t.status === "open").length} not yet acknowledged`, `${res.length} resolved in period`, `${open.filter((t) => t.escalated).length} escalated`] });
    }
  }
  if (kind === "investigations") {
    const { data } = await sb.from("investigations").select("title,status,equipment_id,created_at,closed_at,confirmed_root_cause,resolution").eq("org_id", orgId).gte("created_at", s).order("created_at", { ascending: false });
    count = data?.length ?? 0;
    sections.push({ heading: "Investigations", columns: ["Opened", "Machine", "Title", "Status", "Confirmed root cause", "Resolution"], rows: (data ?? []).map((i) => [d(i.created_at), en(i.equipment_id), i.title, i.status, i.confirmed_root_cause ?? "Not confirmed", i.resolution ?? "—"]) });
    const { data: cr } = await sb.from("confirmed_resolutions").select("original_problem,verification_status,time_to_resolution_minutes,equipment_id").eq("org_id", orgId).gte("created_at", s);
    sections.push({ heading: "Resolution outcomes", columns: ["Machine", "Problem", "Time to resolution", "Verification"], rows: (cr ?? []).map((r) => [en(r.equipment_id), r.original_problem.slice(0, 80), m(r.time_to_resolution_minutes), r.verification_status]) });
  }
  if (kind === "knowledge_activity") {
    const { data } = await sb.from("knowledge_records").select("kind,verification,created_at").eq("org_id", orgId).gte("created_at", s);
    count = data?.length ?? 0;
    const tally = (k: "kind" | "verification") => { const t = new Map<string, number>(); data?.forEach((r) => t.set(r[k], (t.get(r[k]) ?? 0) + 1)); return [...t]; };
    sections.push({ heading: "New records by type", columns: ["Type", "Count"], rows: tally("kind") });
    sections.push({ heading: "New records by verification level", columns: ["Level", "Count"], rows: tally("verification") });
    const { count: searches } = await sb.from("ai_agent_runs").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("agent", "industrial_knowledge").gte("created_at", s);
    sections.push({ heading: "Usage", bullets: [`${searches ?? 0} knowledge search(es) in period`] });
  }
  void minutesOf;
  return { title: REPORT_KINDS[kind], period: { start: s, end: end.toISOString() }, generated_at: end.toISOString(), sections, limitations, record_count: count };
}
