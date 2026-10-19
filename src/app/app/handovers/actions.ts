"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/auth/session";
import { need, toState, str, opt } from "@/lib/action-utils";
import { generateHandoverReport, type StoredReport } from "@/lib/ai/agents";
import { handoverReport } from "@/lib/ai/schemas";
import { addKnowledge } from "@/lib/knowledge";
import { loadEquipment } from "@/lib/ai/context";
import { resolveEquipment } from "@/lib/grounding";
import type { ActionState } from "@/components/action-form";

export async function createHandover(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const shiftId = opt(fd, "shift_id");
    let shiftLabel: string | null = null;
    if (shiftId) shiftLabel = (await sb.from("shifts").select("name").eq("id", shiftId).maybeSingle()).data?.name ?? null;
    const { data, error } = await sb.from("handovers").insert({
      org_id: ctx.orgId, author_id: ctx.userId, facility_id: opt(fd, "facility_id"), line_id: opt(fd, "line_id"),
      shift_id: shiftId, shift_label: shiftLabel, shift_date: str(fd, "shift_date") || new Date().toISOString().slice(0, 10),
      source_notes: str(fd, "notes"),
    }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id;
    await audit(ctx, "handover.created", "handovers", id);
  } catch (e) { return toState(e); }
  redirect(`/app/handovers/${id}`);
}

export async function saveNotes(handoverId: string, notes: string, attachments: { path: string; name: string }[] = []): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const { data: h } = await sb.from("handovers").select("status,source_notes").eq("id", handoverId).single();
    if (!h) throw new Error("Handover not found");
    if (h.status !== "draft") throw new Error("Submitted handovers are locked; the original notes are preserved.");
    const { error } = await sb.from("handovers").update({ source_notes: notes, updated_at: new Date().toISOString() }).eq("id", handoverId);
    if (error) throw new Error(error.message);
    if (attachments.length) {
      await sb.from("shift_notes").insert({ org_id: ctx.orgId, handover_id: handoverId, author_id: ctx.userId, kind: "note", body: "Attachments", attachments });
    }
    revalidatePath(`/app/handovers/${handoverId}`);
    return { message: "Notes saved" };
  } catch (e) { return toState(e); }
}

/** Voice notes: the approved transcript is appended to the notes and kept as a shift_notes row (retention applies). */
export async function addVoiceNote(handoverId: string, transcript: string): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const { data: h } = await sb.from("handovers").select("source_notes,status").eq("id", handoverId).single();
    if (!h || h.status !== "draft") throw new Error("Handover is not editable");
    await sb.from("shift_notes").insert({ org_id: ctx.orgId, handover_id: handoverId, author_id: ctx.userId, kind: "voice", body: transcript });
    const merged = `${h.source_notes}${h.source_notes ? "\n\n" : ""}[Voice note] ${transcript}`;
    await sb.from("handovers").update({ source_notes: merged, updated_at: new Date().toISOString() }).eq("id", handoverId);
    revalidatePath(`/app/handovers/${handoverId}`);
    return { message: "Voice note added" };
  } catch (e) { return toState(e); }
}

export async function generateReport(handoverId: string, notes: string): Promise<ActionState> {
  try {
    const ctx = await need("ai.run");
    const saved = await saveNotes(handoverId, notes);
    if (saved?.error) return saved;
    await generateHandoverReport(ctx, handoverId);
    revalidatePath(`/app/handovers/${handoverId}`);
    return { message: "Report generated. Review it carefully before confirming." };
  } catch (e) { return toState(e); }
}

/** Material edits to the AI report are stored with before/after for audit. */
export async function saveReportEdit(handoverId: string, reportJson: string, summary: string): Promise<ActionState> {
  try {
    const ctx = await need("capture");
    const sb = await createClient();
    const next = JSON.parse(reportJson) as StoredReport;
    const parsed = handoverReport.safeParse(next);
    if (!parsed.success) throw new Error("Edited report is not valid");
    const { data: h } = await sb.from("handovers").select("report,status").eq("id", handoverId).single();
    if (!h || h.status !== "draft") throw new Error("Only draft handovers can be edited");
    await sb.from("handovers").update({ report: next, operator_confirmed: false, updated_at: new Date().toISOString() }).eq("id", handoverId);
    await sb.from("handover_edits").insert({ org_id: ctx.orgId, handover_id: handoverId, editor_id: ctx.userId, summary: summary || "Report edited", before: h.report, after: next });
    await audit(ctx, "handover.edited", "handovers", handoverId, { summary });
    revalidatePath(`/app/handovers/${handoverId}`);
    return { message: "Edit saved and logged" };
  } catch (e) { return toState(e); }
}

/**
 * Confirm + submit. Persists continuity records from the *human-confirmed* report only:
 * open issues -> follow_up_tasks, machine events -> incidents/downtime (when a machine resolves), knowledge -> operator-reported.
 */
export async function submitHandover(handoverId: string, confirmed: boolean): Promise<ActionState> {
  try {
    const ctx = await need("handover.submit");
    if (!confirmed) throw new Error("Confirm that you have reviewed the report before submitting.");
    const sb = await createClient();
    const { data: h } = await sb.from("handovers").select("*").eq("id", handoverId).single();
    if (!h) throw new Error("Handover not found");
    if (h.status !== "draft") throw new Error("Already submitted");
    const report = h.report as StoredReport | null;
    if (!report) throw new Error("Generate the report first so there is something to confirm.");
    const equipment = await loadEquipment(sb, ctx.orgId);
    const eqId = (ref: string | null) => (ref ? resolveEquipment(ref, equipment)?.id ?? null : null);

    // carry previous unresolved items forward one more shift
    const { data: carried } = await sb.from("follow_up_tasks").select("id,shifts_carried").eq("org_id", ctx.orgId).neq("status", "resolved").neq("handover_id", handoverId);
    for (const t of carried ?? []) await sb.from("follow_up_tasks").update({ shifts_carried: t.shifts_carried + 1 }).eq("id", t.id);

    if (report.issues.length) {
      const { error } = await sb.from("follow_up_tasks").insert(report.issues.map((i) => ({
        org_id: ctx.orgId, handover_id: handoverId, equipment_id: eqId(i.equipment_ref), title: i.title, detail: [i.detail, i.suggested_follow_up].filter(Boolean).join(" | "),
        kind: i.kind, priority: i.priority, status: "open", escalated: i.requires_escalation, source_quote: i.source_quote, created_by: ctx.userId,
      })));
      if (error) throw new Error(error.message);
    }
    for (const m of report.machine_events) {
      const equipment_id = eqId(m.equipment_ref);
      const { data: inc } = await sb.from("incidents").insert({
        org_id: ctx.orgId, equipment_id, handover_id: handoverId, title: `${m.equipment_ref}: ${m.event}`.slice(0, 200),
        description: [m.context && `Context: ${m.context}`, m.action_taken && `Action taken: ${m.action_taken}`, m.current_state && `State: ${m.current_state}`, m.outstanding_concern && `Concern: ${m.outstanding_concern}`].filter(Boolean).join(". "),
        category: "fault", severity: m.outstanding_concern ? "medium" : "low", status: "open", shift_label: h.shift_label, reported_by: ctx.userId,
      }).select("id").single();
      if (equipment_id && (m.stoppage_count || m.duration_minutes)) {
        const n = Math.max(1, m.stoppage_count ?? 1);
        await sb.from("downtime_events").insert(Array.from({ length: n }, () => ({
          org_id: ctx.orgId, equipment_id, incident_id: inc?.id, handover_id: handoverId, started_at: new Date(`${h.shift_date}T12:00:00Z`).toISOString(),
          duration_minutes: n === 1 ? m.duration_minutes : null, shift_label: h.shift_label, context: m.context || null, source: "handover",
          notes: "Time of day not recorded: shift date only. Created from submitted handover.",
        })));
      }
      await addKnowledge(ctx, {
        title: `${m.equipment_ref}: ${m.event}`, body: [m.context, m.action_taken, m.current_state, m.outstanding_concern].filter(Boolean).join(". "),
        kind: "handover_entry", verification: "operator_reported", equipment_id, source_table: "handovers", source_id: handoverId, shift_label: h.shift_label, occurred_at: new Date(`${h.shift_date}T12:00:00Z`).toISOString(),
      });
    }
    const { error } = await sb.from("handovers").update({ status: "submitted", operator_confirmed: true, submitted_at: new Date().toISOString(), reviewed_by: ctx.userId }).eq("id", handoverId);
    if (error) throw new Error(error.message);
    await audit(ctx, "handover.submitted", "handovers", handoverId, { issues: report.issues.length });
    revalidatePath("/app", "layout");
    return { message: "Handover submitted to the incoming shift." };
  } catch (e) { return toState(e); }
}

export async function acknowledgeHandover(handoverId: string, fd: FormData): Promise<void> {
  const ctx = await need("capture");
  const sb = await createClient();
  const { error } = await sb.from("handover_acknowledgements").upsert({ org_id: ctx.orgId, handover_id: handoverId, user_id: ctx.userId, note: opt(fd, "note") }, { onConflict: "handover_id,user_id" });
  if (error) throw new Error(error.message);
  await sb.from("handovers").update({ status: "acknowledged" }).eq("id", handoverId).eq("status", "submitted");
  await audit(ctx, "handover.acknowledged", "handovers", handoverId);
  revalidatePath(`/app/handovers/${handoverId}`);
}
