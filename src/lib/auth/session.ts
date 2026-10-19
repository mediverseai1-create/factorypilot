import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import type { Role } from "./permissions";

export type Ctx = {
  userId: string; email: string; fullName: string; orgId: string; orgName: string; role: Role;
  retentionDays: number; requireApproval: boolean;
};

/** Resolves the signed-in user and active organisation. Redirects to login / onboarding as needed. */
export const getCtx = cache(async (): Promise<Ctx> => {
  if (!supabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.rpc("accept_pending_invites");
  const { data: m } = await supabase
    .from("organization_members")
    .select("role, org_id, organizations(name, retention_days, require_work_order_approval)")
    .eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!m) redirect("/onboarding");
  const { data: p } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const org = m.organizations as unknown as { name: string; retention_days: number; require_work_order_approval: boolean };
  return {
    userId: user.id, email: user.email ?? "", fullName: p?.full_name || user.email || "User", orgId: m.org_id,
    orgName: org.name, role: m.role as Role, retentionDays: org.retention_days, requireApproval: org.require_work_order_approval,
  };
});

export async function audit(ctx: Ctx, action: string, entity_table?: string, entity_id?: string, detail?: Record<string, unknown>) {
  const supabase = await createClient();
  await supabase.from("activity_logs").insert({ org_id: ctx.orgId, actor_id: ctx.userId, action, entity_table, entity_id, detail });
}
