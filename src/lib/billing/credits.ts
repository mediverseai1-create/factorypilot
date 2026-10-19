import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADVANCED_FEATURES, FEATURE_COST, PLANS, type Feature } from "./plans";

export type Entitlement = { plan: "none" | "professional" | "enterprise"; status: string; balance: number; allowanceConfigured: boolean };

export async function getEntitlement(orgId: string): Promise<Entitlement> {
  const sb = await createClient();
  const [{ data: s }, { data: b }] = await Promise.all([
    sb.from("subscriptions").select("plan,status").eq("org_id", orgId).maybeSingle(),
    sb.from("credit_balances").select("balance,allowance_configured").eq("org_id", orgId).maybeSingle(),
  ]);
  return { plan: (s?.plan ?? "none") as Entitlement["plan"], status: s?.status ?? "inactive", balance: b?.balance ?? 0, allowanceConfigured: b?.allowance_configured ?? false };
}

export class EntitlementError extends Error {}

/** Throws EntitlementError (with a user-facing message) when the org may not run this feature. */
export async function assertEntitled(orgId: string, feature: Feature): Promise<void> {
  const e = await getEntitlement(orgId);
  const open = process.env.ALLOW_UNSUBSCRIBED_AI === "true"; // evaluation / self-hosted override; off by default
  if (!open && !(e.status === "active" && e.plan !== "none")) {
    throw new EntitlementError("AI features need an active FactoryPilot subscription. Open Usage & Billing to subscribe.");
  }
  if (!open && ADVANCED_FEATURES.includes(feature) && !PLANS[e.plan as "enterprise"]?.advancedAnalytics) {
    throw new EntitlementError("This capability is part of the Enterprise plan (advanced analytics).");
  }
  if (e.allowanceConfigured && e.balance < FEATURE_COST[feature]) {
    throw new EntitlementError("No AI credits remaining. Upgrade or wait for the next allowance to continue.");
  }
}

/** Atomic server-side deduction (service role + row lock in consume_credits). Always writes an ai_usage row. */
export async function charge(orgId: string, userId: string, feature: Feature, runId?: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("consume_credits", {
    p_org: orgId, p_user: userId, p_feature: feature, p_credits: FEATURE_COST[feature], p_run: runId ?? null,
  });
  if (error) throw new Error(`Usage metering failed: ${error.message}`);
  return Boolean(data);
}
