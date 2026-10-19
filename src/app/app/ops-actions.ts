"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/auth/session";
import { need, toState, str, opt, num, iso } from "@/lib/action-utils";
import { addKnowledge } from "@/lib/knowledge";
import type { ActionState } from "@/components/action-form";
import { analyzeDowntime, analyzeInvestigation, draftWorkOrder, generateBriefing, improvementReview } from "@/lib/ai/agents";

const done = (path: string, message: string): ActionState => { revalidatePath(path); return { message }; };

/* ───────── equipment ───────── */
export async function createEquipment(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("equipment.manage");
    const sb = await createClient();
    const { error } = await sb.from("equipment").insert({
      org_id: ctx.orgId, name: str(fd, "name"), identifier: str(fd, "identifier"), equipment_type: opt(fd, "equipment_type"),
      line_id: opt(fd, "line_id"), facility_id: opt(fd, "facility_id"), location: opt(fd, "location"), manufacturer: opt(fd, "manufacturer"),
      model: opt(fd, "model"), operating_limits: opt(fd, "operating_limits"), maintenance_owner: opt(fd, "maintenance_owner"),
    });
    if (error) throw new Error(error.code === "23505" ? "An equipment record with that ID already exists." : error.message);
    await audit(ctx, "equipment.created", "equipment", undefined, { identifier: str(fd, "identifier") });
    return done("/app/equipment", "Equipment registered");
  } catch (e) { return toState(e); }
}

export async function setEquipmentStatus(id: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const { error } = await sb.from("equipment").update({ status: str(fd, "status"), status_updated_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, "equipment.status", "equipment", id, { status: str(fd, "status") });
  revalidatePath(`/app/equipment/${id}`);
}

/* ───────── incidents / downtime / maintenance ───────── */
export async function createIncident(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const equipment_id = opt(fd, "equipment_id");
    const { data, error } = await sb.from("incidents").insert({
      org_id: ctx.orgId, equipment_id, title: str(fd, "title"), description: opt(fd, "description"), category: str(fd, "category") || "fault",
      severity: str(fd, "severity") || "medium", fault_code: opt(fd, "fault_code"), shift_label: opt(fd, "shift_label"),
      occurred_at: iso(fd, "occurred_at") ?? new Date().toISOString(), reported_by: ctx.userId,
    }).select("id,occurred_at").single();
    if (error) throw new Error(error.message);
    await addKnowledge(ctx, { title: str(fd, "title"), body: str(fd, "description") || str(fd, "title"), kind: "incident", equipment_id, source_table: "incidents", source_id: data.id, fault_code: opt(fd, "fault_code"), occurred_at: data.occurred_at });
    await audit(ctx, "incident.created", "incidents", data.id);
    return done("/app/incidents", str(fd, "category") === "safety" ? "Incident logged. Safety events must also follow your site’s established escalation procedure." : "Incident logged");
  } catch (e) { return toState(e); }
}

export async function setIncidentStatus(id: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const status = str(fd, "status");
  const { error } = await sb.from("incidents").update({ status, resolved_at: status === "resolved" ? new Date().toISOString() : null }).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, `incident.${status}`, "incidents", id);
  revalidatePath("/app/incidents");
}

export async function createDowntime(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const started = iso(fd, "started_at"); if (!started) throw new Error("Start time is required");
    const ended = iso(fd, "ended_at");
    if (ended && ended < started) throw new Error("End time is before start time");
    const { error } = await sb.from("downtime_events").insert({
      org_id: ctx.orgId, equipment_id: opt(fd, "equipment_id"), started_at: started, ended_at: ended, duration_minutes: num(fd, "duration_minutes"),
      fault_code: opt(fd, "fault_code"), shift_label: opt(fd, "shift_label"), context: opt(fd, "context"), cause_category: opt(fd, "cause_category"), notes: opt(fd, "notes"), source: "manual",
    });
    if (error) throw new Error(error.message);
    await audit(ctx, "downtime.created", "downtime_events");
    return done("/app/downtime", "Downtime event recorded");
  } catch (e) { return toState(e); }
}

export async function createMaintenance(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("equipment.manage");
    const sb = await createClient();
    const equipment_id = str(fd, "equipment_id"); if (!equipment_id) throw new Error("Choose a machine");
    const { data, error } = await sb.from("maintenance_records").insert({
      org_id: ctx.orgId, equipment_id, performed_at: iso(fd, "performed_at") ?? new Date().toISOString(), performed_by: opt(fd, "performed_by"),
      action_type: opt(fd, "action_type"), description: str(fd, "description"), parts_replaced: opt(fd, "parts_replaced"),
      outcome: str(fd, "outcome") || "unknown", duration_minutes: num(fd, "duration_minutes"), created_by: ctx.userId,
    }).select("id,performed_at").single();
    if (error) throw new Error(error.message);
    await addKnowledge(ctx, { title: `Maintenance: ${str(fd, "action_type") || "intervention"}`, body: `${str(fd, "description")}. Parts: ${str(fd, "parts_replaced") || "none recorded"}. Outcome: ${str(fd, "outcome") || "unknown"}.`, kind: "maintenance", equipment_id, source_table: "maintenance_records", source_id: data.id, occurred_at: data.performed_at });
    await audit(ctx, "maintenance.recorded", "maintenance_records", data.id);
    return done("/app/maintenance", "Maintenance record saved");
  } catch (e) { return toState(e); }
}

/* ───────── work orders ───────── */
export async function createWorkOrder(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("workorder.draft");
    const sb = await createClient();
    const { data, error } = await sb.from("work_orders").insert({
      org_id: ctx.orgId, equipment_id: opt(fd, "equipment_id"), title: str(fd, "title"), symptoms: opt(fd, "symptoms"), recommended_inspection: opt(fd, "recommended_inspection"),
      priority: str(fd, "priority") || "medium", assigned_team: opt(fd, "assigned_team"), status: "pending_approval", created_by: ctx.userId,
      safety_notice: "Follow site lockout/tagout and isolation procedures. A qualified person must review this work order.",
    }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(ctx, "workorder.created", "work_orders", data.id);
    return done("/app/maintenance", "Work order submitted for approval");
  } catch (e) { return toState(e); }
}

export async function decideWorkOrder(id: string, fd: FormData): Promise<void> {
  const ctx = await need("workorder.approve");
  const sb = await createClient();
  const decision = str(fd, "decision") as "approved" | "rejected";
  const { error } = await sb.from("work_orders").update({ status: decision }).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await sb.from("work_order_approvals").insert({ org_id: ctx.orgId, work_order_id: id, approver_id: ctx.userId, decision, comment: opt(fd, "comment") });
  await audit(ctx, `workorder.${decision}`, "work_orders", id);
  revalidatePath("/app/maintenance");
}

export async function advanceWorkOrder(id: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const status = str(fd, "status");
  const patch: Record<string, unknown> = { status };
  if (status === "completed") patch.completed_at = new Date().toISOString();
  const { error } = await sb.from("work_orders").update(patch).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, `workorder.${status}`, "work_orders", id);
  revalidatePath("/app/maintenance");
}

/* ───────── investigations ───────── */
export async function createInvestigation(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await need("investigation.run");
    const sb = await createClient();
    const { data, error } = await sb.from("investigations").insert({
      org_id: ctx.orgId, equipment_id: opt(fd, "equipment_id"), incident_id: opt(fd, "incident_id"), title: str(fd, "title"),
      reported_problem: str(fd, "reported_problem"), owner_id: opt(fd, "owner_id") ?? ctx.userId, created_by: ctx.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id;
    await sb.from("incidents").update({ status: "investigating" }).eq("id", opt(fd, "incident_id") ?? "00000000-0000-0000-0000-000000000000").eq("status", "open");
    await audit(ctx, "investigation.opened", "investigations", id);
  } catch (e) { return toState(e); }
  redirect(`/app/investigations/${id}`);
}

export async function addEvidence(invId: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const { error } = await sb.from("investigation_evidence").insert({
    org_id: ctx.orgId, investigation_id: invId, kind: str(fd, "kind"), statement: str(fd, "statement"), origin: "human", review_status: "accepted", created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/investigations/${invId}`);
}

export async function reviewEvidence(invId: string, evId: string, fd: FormData): Promise<void> {
  const ctx = await need("investigation.run");
  const sb = await createClient();
  await sb.from("investigation_evidence").update({ review_status: str(fd, "review_status") }).eq("id", evId).eq("org_id", ctx.orgId);
  await audit(ctx, `evidence.${str(fd, "review_status")}`, "investigation_evidence", evId);
  revalidatePath(`/app/investigations/${invId}`);
}

export async function addStep(invId: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const { error } = await sb.from("troubleshooting_steps").insert({ org_id: ctx.orgId, investigation_id: invId, description: str(fd, "description"), outcome: str(fd, "outcome") || "unknown", performed_by: ctx.userId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/investigations/${invId}`);
}

/** Confirming a root cause is a human act. The DB trigger also restricts it to qualified roles. */
export async function confirmRootCause(invId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("investigation.confirm");
    const sb = await createClient();
    const rc = str(fd, "confirmed_root_cause");
    if (rc.length < 10) throw new Error("Describe the confirmed root cause and how it was established.");
    const { error } = await sb.from("investigations").update({ confirmed_root_cause: rc, status: "awaiting_confirmation" }).eq("id", invId).eq("org_id", ctx.orgId);
    if (error) throw new Error(error.message);
    await sb.from("investigation_evidence").insert({ org_id: ctx.orgId, investigation_id: invId, kind: "confirmed_root_cause", statement: rc, origin: "human", review_status: "accepted", created_by: ctx.userId });
    await audit(ctx, "investigation.root_cause_confirmed", "investigations", invId);
    return done(`/app/investigations/${invId}`, "Root cause recorded as confirmed by you");
  } catch (e) { return toState(e); }
}

/** Closing creates a confirmed resolution and a verified-resolution knowledge record for future search. */
export async function closeInvestigation(invId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("investigation.confirm");
    const sb = await createClient();
    const { data: inv } = await sb.from("investigations").select("*").eq("id", invId).eq("org_id", ctx.orgId).single();
    if (!inv) throw new Error("Not found");
    const resolution = str(fd, "resolution"); if (resolution.length < 5) throw new Error("Describe the resolution");
    const { data: steps } = await sb.from("troubleshooting_steps").select("description,outcome").eq("investigation_id", invId);
    const failed = steps?.filter((s) => s.outcome === "failed" || s.outcome === "partial").map((s) => s.description).join("; ") || null;
    const tried = steps?.map((s) => `${s.description} (${s.outcome})`).join("; ") || null;
    const ttr = (Date.now() - new Date(inv.created_at).getTime()) / 60000;
    const kid = await addKnowledge(ctx, {
      title: `Resolved: ${inv.title}`,
      body: `Problem: ${inv.reported_problem}\nRoot cause: ${inv.confirmed_root_cause ?? "not established"}\nResolution: ${resolution}\nUnsuccessful actions: ${failed ?? "none recorded"}\nParts: ${str(fd, "parts_replaced") || "none recorded"}`,
      kind: "resolution", verification: "verified_resolution", equipment_id: inv.equipment_id, source_table: "investigations", source_id: invId,
    });
    const { error } = await sb.from("confirmed_resolutions").insert({
      org_id: ctx.orgId, investigation_id: invId, incident_id: inv.incident_id, equipment_id: inv.equipment_id, original_problem: inv.reported_problem,
      root_cause: inv.confirmed_root_cause, resolution, actions_attempted: tried, unsuccessful_actions: failed, parts_replaced: opt(fd, "parts_replaced"),
      time_to_resolution_minutes: Math.round(ttr), verification_status: "pending", knowledge_record_id: kid, created_by: ctx.userId,
    });
    if (error) throw new Error(error.message);
    await sb.from("investigations").update({ status: "closed", resolution, outcome: opt(fd, "outcome"), closed_at: new Date().toISOString() }).eq("id", invId);
    if (inv.incident_id) await sb.from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", inv.incident_id);
    await audit(ctx, "investigation.closed", "investigations", invId);
    return done(`/app/investigations/${invId}`, "Investigation closed. Resolution preserved in the knowledge base (verification pending).");
  } catch (e) { return toState(e); }
}

export async function verifyResolution(id: string, fd: FormData): Promise<void> {
  const ctx = await need("investigation.confirm");
  const sb = await createClient();
  const recurred = str(fd, "result") === "recurred";
  await sb.from("confirmed_resolutions").update(recurred
    ? { verification_status: "recurred", recurred_at: new Date().toISOString() }
    : { verification_status: "verified", verified_by: ctx.userId, verified_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.orgId);
  await audit(ctx, recurred ? "resolution.recurred" : "resolution.verified", "confirmed_resolutions", id);
  revalidatePath("/app/investigations");
  revalidatePath("/app/reports");
}

/* ───────── knowledge ───────── */
export async function createKnowledge(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    await addKnowledge(ctx, { title: str(fd, "title"), body: str(fd, "body"), kind: (str(fd, "kind") || "lesson") as "lesson", equipment_id: opt(fd, "equipment_id"), fault_code: opt(fd, "fault_code"), verification: "operator_reported" });
    await audit(ctx, "knowledge.created", "knowledge_records");
    return done("/app/knowledge", "Added as operator-reported knowledge. A qualified reviewer can raise its verification level.");
  } catch (e) { return toState(e); }
}

export async function setVerification(id: string, fd: FormData): Promise<void> {
  const level = str(fd, "verification");
  const ctx = await need(level === "supervisor_approved" ? "knowledge.approve" : "knowledge.confirm");
  const sb = await createClient();
  const { error } = await sb.from("knowledge_records").update({ verification: level }).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, "knowledge.verification", "knowledge_records", id, { level });
  revalidatePath("/app/knowledge");
}

/** Back-fills embeddings for records created without one (e.g., CSV imports or before AI was configured). */
export async function reindexKnowledge(_p?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const ctx = await need("import");
    const { embed } = await import("@/lib/ai/gemini");
    const sb = await createClient();
    const { data } = await sb.from("knowledge_records").select("id,title,body").eq("org_id", ctx.orgId).is("embedding", null).limit(60);
    let n = 0;
    for (const r of data ?? []) {
      const v = await embed(`${r.title}\n${r.body}`);
      if (!v) { if (!n) throw new Error("Embeddings unavailable: check GEMINI_API_KEY."); break; }
      await sb.from("knowledge_records").update({ embedding: `[${v.join(",")}]` }).eq("id", r.id);
      n++;
    }
    return done("/app/knowledge", n ? `Indexed ${n} record(s) for semantic search${(data?.length ?? 0) > n ? ". Run again for more." : "."}` : "All records are already indexed.");
  } catch (e) { return toState(e); }
}

/* ───────── AI triggers (results are persisted; pages render stored output) ───────── */
export async function runBriefing(_p?: ActionState, _f?: FormData): Promise<ActionState> {
  try { const ctx = await need("ai.run"); await generateBriefing(ctx); return done("/app/briefings", "Briefing prepared"); } catch (e) { return toState(e); }
}
export async function runDowntimeAnalysis(_: ActionState, fd: FormData): Promise<ActionState> {
  try { const ctx = await need("ai.run"); await analyzeDowntime(ctx, { equipmentId: opt(fd, "equipment_id") ?? undefined, days: num(fd, "days") ?? 90 }); return done("/app/downtime", "Analysis complete"); } catch (e) { return toState(e); }
}
export async function runInvestigationAI(invId: string, _p?: ActionState, _f?: FormData): Promise<ActionState> {
  try { const ctx = await need("investigation.run"); await analyzeInvestigation(ctx, invId); return done(`/app/investigations/${invId}`, "Evidence organised. Review each AI-proposed item before relying on it."); } catch (e) { return toState(e); }
}
export async function runWorkOrderDraft(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("workorder.draft");
    const equipmentId = str(fd, "equipment_id"); if (!equipmentId) throw new Error("Choose a machine");
    await draftWorkOrder(ctx, { equipmentId, incidentId: opt(fd, "incident_id") ?? undefined, investigationId: opt(fd, "investigation_id") ?? undefined });
    return done("/app/maintenance", "Draft created and sent for approval. It cannot be dispatched until an authorised approver signs off.");
  } catch (e) { return toState(e); }
}
export async function runImprovement(_p?: ActionState, _f?: FormData): Promise<ActionState> {
  try { const ctx = await need("ai.run"); await improvementReview(ctx); return done("/app/reports", "Improvement review complete"); } catch (e) { return toState(e); }
}
