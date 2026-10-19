import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/**
 * Subscription activation endpoint. It only acts on requests signed with PAYMENT_WEBHOOK_SECRET
 * (HMAC-SHA256 of the raw body, hex, in `x-factorypilot-signature`). Without that secret it refuses to operate:
 * a redirect from a payment page is never proof of payment.
 *
 * Expected JSON: { event: "subscription.activated"|"subscription.cancelled"|"subscription.past_due",
 *                  org_id: uuid, plan: "professional"|"enterprise", external_ref?: string, current_period_end?: ISO date, event_id: string }
 * Payment providers that cannot sign this shape need a small adapter in front (or manual activation by the platform operator).
 */
const payload = z.object({
  event: z.enum(["subscription.activated", "subscription.cancelled", "subscription.past_due"]),
  org_id: z.string().uuid(), plan: z.enum(["professional", "enterprise"]), event_id: z.string().min(1),
  external_ref: z.string().optional(), current_period_end: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  if (!env.webhookSecret) return NextResponse.json({ error: "Webhook verification is not configured (PAYMENT_WEBHOOK_SECRET)." }, { status: 501 });
  const raw = await req.text();
  const sig = req.headers.get("x-factorypilot-signature") ?? "";
  const expected = crypto.createHmac("sha256", env.webhookSecret).update(raw).digest("hex");
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const p = payload.safeParse(JSON.parse(raw || "{}"));
  if (!p.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const { event, org_id, plan, external_ref, current_period_end, event_id } = p.data;

  const admin = createAdminClient();
  const { data: dup } = await admin.from("credit_transactions").select("id").eq("org_id", org_id).eq("ref", `evt:${event_id}`).maybeSingle();
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  const status = event === "subscription.activated" ? "active" : event === "subscription.cancelled" ? "cancelled" : "past_due";
  const { error } = await admin.from("subscriptions").upsert({ org_id, plan, status, external_ref: external_ref ?? null, current_period_end: current_period_end ?? null, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Grant the monthly allowance only when final quantities have been configured.
  const allowance = Number(plan === "professional" ? process.env.PROFESSIONAL_MONTHLY_CREDITS : process.env.ENTERPRISE_MONTHLY_CREDITS);
  if (event === "subscription.activated" && Number.isFinite(allowance) && allowance > 0) {
    const { data: bal } = await admin.from("credit_balances").select("balance").eq("org_id", org_id).single();
    await admin.from("credit_balances").update({ balance: (bal?.balance ?? 0) + allowance, allowance_configured: true, updated_at: new Date().toISOString() }).eq("org_id", org_id);
    await admin.from("credit_transactions").insert({ org_id, delta: allowance, reason: `${plan} allowance`, ref: `evt:${event_id}` });
  } else {
    await admin.from("credit_transactions").insert({ org_id, delta: 0, reason: event, ref: `evt:${event_id}` });
  }
  await admin.from("activity_logs").insert({ org_id, action: `billing.${event}`, entity_table: "subscriptions", entity_id: org_id, detail: { plan, event_id } });
  return NextResponse.json({ ok: true });
}
