"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/auth/session";
import { need, toState, str, opt, iso } from "@/lib/action-utils";
import { getCtx } from "@/lib/auth/session";
import type { ActionState } from "@/components/action-form";

/* ───── follow-ups: acknowledged / assigned / resolved / awaiting investigation ───── */
export async function updateTask(id: string, fd: FormData): Promise<void> {
  const ctx = await need("followup.update");
  const sb = await createClient();
  const status = str(fd, "status");
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) patch.status = status;
  if (fd.has("owner_id")) patch.owner_id = opt(fd, "owner_id");
  if (fd.has("due_at")) patch.due_at = iso(fd, "due_at");
  if (fd.get("escalate") === "1") patch.escalated = true;
  if (status === "resolved") {
    patch.resolved_at = new Date().toISOString();
    patch.resolution_note = str(fd, "resolution_note") || null;
  }
  const { error } = await sb.from("follow_up_tasks").update(patch).eq("id", id).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, `followup.${status || "updated"}`, "follow_up_tasks", id, patch);
  revalidatePath("/app", "layout");
}

export async function createTask(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("followup.update");
    const sb = await createClient();
    const title = str(fd, "title");
    if (!title) throw new Error("Enter a title");
    const { data, error } = await sb.from("follow_up_tasks").insert({
      org_id: ctx.orgId, title, detail: opt(fd, "detail"), kind: str(fd, "kind") || "issue", priority: str(fd, "priority") || "medium",
      equipment_id: opt(fd, "equipment_id"), owner_id: opt(fd, "owner_id"), due_at: iso(fd, "due_at"), created_by: ctx.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(ctx, "followup.created", "follow_up_tasks", data.id);
    revalidatePath("/app", "layout");
    return { message: "Follow-up created" };
  } catch (e) { return toState(e); }
}

/* ───── feedback on AI output ───── */
export async function submitFeedback(table: string, targetId: string, rating: "helpful" | "incorrect" | "incomplete", comment?: string): Promise<ActionState> {
  try {
    const ctx = await getCtx();
    const sb = await createClient();
    const { error } = await sb.from("feedback_records").insert({ org_id: ctx.orgId, user_id: ctx.userId, target_table: table, target_id: targetId, rating, comment: comment || null });
    if (error) throw new Error(error.message);
    return { message: "Thanks. Feedback recorded." };
  } catch (e) { return toState(e); }
}

export async function markNotificationsRead(): Promise<void> {
  const ctx = await getCtx();
  const sb = await createClient();
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath("/app", "layout");
}
