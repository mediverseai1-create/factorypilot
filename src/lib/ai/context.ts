import "server-only";
import { createClient } from "@/lib/supabase/server";
import { recId, type ContextRecord, type EqLite } from "@/lib/grounding";

type SB = Awaited<ReturnType<typeof createClient>>;

/** All retrieval goes through the caller's Supabase session, so RLS applies to anything the AI sees. */
export async function loadEquipment(sb: SB, orgId: string): Promise<EqLite[]> {
  const { data } = await sb.from("equipment").select("id,name,identifier,line_id,status").eq("org_id", orgId).limit(500);
  return (data ?? []) as EqLite[];
}

const d = (s?: string | null) => s ?? "";

export async function equipmentRecords(sb: SB, orgId: string, equipmentId: string, perTable = 15): Promise<ContextRecord[]> {
  const [inc, dt, mt, kn, tk, cr] = await Promise.all([
    sb.from("incidents").select("id,title,description,fault_code,status,severity,occurred_at,shift_label").eq("org_id", orgId).eq("equipment_id", equipmentId).order("occurred_at", { ascending: false }).limit(perTable),
    sb.from("downtime_events").select("id,started_at,duration_minutes,fault_code,shift_label,context,notes").eq("org_id", orgId).eq("equipment_id", equipmentId).order("started_at", { ascending: false }).limit(perTable),
    sb.from("maintenance_records").select("id,performed_at,action_type,description,parts_replaced,outcome").eq("org_id", orgId).eq("equipment_id", equipmentId).order("performed_at", { ascending: false }).limit(perTable),
    sb.from("knowledge_records").select("id,title,body,verification,occurred_at").eq("org_id", orgId).eq("equipment_id", equipmentId).order("occurred_at", { ascending: false }).limit(perTable),
    sb.from("follow_up_tasks").select("id,title,detail,status,priority,created_at").eq("org_id", orgId).eq("equipment_id", equipmentId).order("created_at", { ascending: false }).limit(perTable),
    sb.from("confirmed_resolutions").select("id,original_problem,root_cause,resolution,unsuccessful_actions,verification_status,created_at").eq("org_id", orgId).eq("equipment_id", equipmentId).order("created_at", { ascending: false }).limit(perTable),
  ]);
  const out: ContextRecord[] = [];
  inc.data?.forEach((r) => out.push({ id: recId("incident", r.id), kind: "incident", date: r.occurred_at, text: `${r.title}. ${d(r.description)} fault_code=${d(r.fault_code)} status=${r.status} severity=${r.severity} shift=${d(r.shift_label)}` }));
  dt.data?.forEach((r) => out.push({ id: recId("downtime", r.id), kind: "downtime_event", date: r.started_at, text: `Stoppage duration_min=${r.duration_minutes ?? "unknown"} fault_code=${d(r.fault_code)} shift=${d(r.shift_label)} context=${d(r.context)} ${d(r.notes)}` }));
  mt.data?.forEach((r) => out.push({ id: recId("maintenance", r.id), kind: "maintenance_record", date: r.performed_at, text: `${d(r.action_type)}: ${r.description} parts=${d(r.parts_replaced)} outcome=${r.outcome}` }));
  kn.data?.forEach((r) => out.push({ id: recId("knowledge", r.id), kind: `knowledge(${r.verification})`, date: r.occurred_at, text: `${r.title}. ${r.body}` }));
  tk.data?.forEach((r) => out.push({ id: recId("task", r.id), kind: "follow_up", date: r.created_at, text: `${r.title}. ${d(r.detail)} status=${r.status} priority=${r.priority}` }));
  cr.data?.forEach((r) => out.push({ id: recId("resolution", r.id), kind: `confirmed_resolution(${r.verification_status})`, date: r.created_at, text: `Problem: ${r.original_problem}. Root cause: ${d(r.root_cause) || "not recorded"}. Resolution: ${r.resolution}. Unsuccessful: ${d(r.unsuccessful_actions)}` }));
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export async function openTasks(sb: SB, orgId: string, limit = 40) {
  const { data } = await sb.from("follow_up_tasks")
    .select("id,title,detail,kind,priority,status,equipment_id,due_at,shifts_carried,escalated,created_at,handover_id")
    .eq("org_id", orgId).neq("status", "resolved").order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}
