"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/auth/session";
import { need, toState, str, opt } from "@/lib/action-utils";
import { ROLES } from "@/lib/auth/permissions";
import type { ActionState } from "@/components/action-form";

const done = (path: string, message: string): ActionState => { revalidatePath(path); return { message }; };

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("team.manage");
    const email = z.string().email("Enter a valid email").parse(str(fd, "email").toLowerCase());
    const role = z.enum(ROLES).parse(str(fd, "role"));
    if (role === "owner") throw new Error("Owners cannot be invited. Transfer ownership by changing a member’s role.");
    const sb = await createClient();
    const { error } = await sb.from("organization_invites").upsert({ org_id: ctx.orgId, email, role, invited_by: ctx.userId, accepted_at: null }, { onConflict: "org_id,email" });
    if (error) throw new Error(error.message);
    await audit(ctx, "member.invited", "organization_invites", undefined, { email, role });
    return done("/app/team", `${email} will join as ${role.replace("_", " ")} when they sign up or sign in with that email. No email is sent automatically; share the sign-up link with them.`);
  } catch (e) { return toState(e instanceof z.ZodError ? new Error(e.issues[0].message) : e); }
}

export async function changeRole(memberId: string, fd: FormData): Promise<void> {
  const ctx = await need("team.manage");
  const role = z.enum(ROLES).parse(str(fd, "role"));
  const sb = await createClient();
  const { data: target } = await sb.from("organization_members").select("user_id,role").eq("id", memberId).eq("org_id", ctx.orgId).single();
  if (!target) throw new Error("Member not found");
  if (target.user_id === ctx.userId && role !== "owner" && ctx.role === "owner") throw new Error("Owners cannot demote themselves; promote another owner first.");
  const { error } = await sb.from("organization_members").update({ role }).eq("id", memberId).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, "member.role_changed", "organization_members", memberId, { from: target.role, to: role });
  revalidatePath("/app/team");
}

export async function removeMember(memberId: string): Promise<void> {
  const ctx = await need("team.manage");
  const sb = await createClient();
  const { error } = await sb.from("organization_members").delete().eq("id", memberId).eq("org_id", ctx.orgId);
  if (error) throw new Error(error.message);
  await audit(ctx, "member.removed", "organization_members", memberId);
  revalidatePath("/app/team");
}

export async function revokeInvite(id: string): Promise<void> {
  const ctx = await need("team.manage");
  const sb = await createClient();
  await sb.from("organization_invites").delete().eq("id", id).eq("org_id", ctx.orgId);
  revalidatePath("/app/team");
}

export async function updateOrgSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("settings.manage");
    const sb = await createClient();
    const days = Number(str(fd, "retention_days"));
    if (!Number.isInteger(days) || days < 30) throw new Error("Retention must be at least 30 days");
    const { error } = await sb.from("organizations").update({ name: str(fd, "name"), industry: opt(fd, "industry"), retention_days: days, require_work_order_approval: fd.get("require_approval") === "on" }).eq("id", ctx.orgId);
    if (error) throw new Error(error.message);
    await audit(ctx, "settings.updated", "organizations", ctx.orgId, { retention_days: days });
    return done("/app/settings", "Settings saved");
  } catch (e) { return toState(e); }
}

export async function addFacility(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("settings.manage");
    const sb = await createClient();
    const { error } = await sb.from("facilities").insert({ org_id: ctx.orgId, name: str(fd, "name"), location: opt(fd, "location"), timezone: str(fd, "timezone") || "UTC" });
    if (error) throw new Error(error.message);
    return done("/app/settings", "Facility added");
  } catch (e) { return toState(e); }
}

export async function addLine(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("settings.manage");
    const sb = await createClient();
    const { error } = await sb.from("production_lines").insert({ org_id: ctx.orgId, facility_id: str(fd, "facility_id"), name: str(fd, "name") });
    if (error) throw new Error(error.message);
    return done("/app/settings", "Production line added");
  } catch (e) { return toState(e); }
}

export async function addShift(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("settings.manage");
    const sb = await createClient();
    const { error } = await sb.from("shifts").insert({ org_id: ctx.orgId, facility_id: opt(fd, "facility_id"), name: str(fd, "name"), start_time: str(fd, "start_time"), end_time: str(fd, "end_time") });
    if (error) throw new Error(error.message);
    return done("/app/settings", "Shift added");
  } catch (e) { return toState(e); }
}

export async function addIntegration(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("settings.manage");
    const sb = await createClient();
    const { error } = await sb.from("integrations").insert({ org_id: ctx.orgId, kind: str(fd, "kind"), name: str(fd, "name"), status: "planned" });
    if (error) throw new Error(error.message);
    await audit(ctx, "integration.planned", "integrations");
    return done("/app/data", "Recorded as planned. No connector is active until one is built and configured.");
  } catch (e) { return toState(e); }
}

export async function addDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await need("import");
    const sb = await createClient();
    const text = str(fd, "text_content");
    const { addKnowledge } = await import("@/lib/knowledge");
    const { data, error } = await sb.from("operational_documents").insert({
      org_id: ctx.orgId, equipment_id: opt(fd, "equipment_id"), title: str(fd, "title"), doc_type: str(fd, "doc_type") || "manual", text_content: text, created_by: ctx.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    if (text) await addKnowledge(ctx, { title: str(fd, "title"), body: text.slice(0, 6000), kind: str(fd, "doc_type") === "manual" ? "manual" : "procedure", equipment_id: opt(fd, "equipment_id"), source_table: "operational_documents", source_id: data.id, verification: "operator_reported" });
    await audit(ctx, "document.added", "operational_documents", data.id);
    return done("/app/data", "Document added. Raise its verification level in the Knowledge Base once reviewed.");
  } catch (e) { return toState(e); }
}
