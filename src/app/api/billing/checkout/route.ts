import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";

/**
 * Sends the user to the externally hosted payment link. This is a redirect only:
 * it grants nothing. Access is activated solely by a verified webhook (see /api/billing/webhook).
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!can(ctx.role, "billing.view")) return NextResponse.json({ error: "Only Owners, Administrators and Plant Managers can manage billing." }, { status: 403 });
  const plan = new URL(req.url).searchParams.get("plan");
  const link = plan === "professional" ? env.professionalLink : plan === "enterprise" ? env.enterpriseLink : "";
  if (!link) return NextResponse.json({ error: "The payment link for this plan is not configured yet." }, { status: 503 });
  let url: URL;
  try { url = new URL(link); } catch { return NextResponse.json({ error: "Configured payment link is not a valid URL." }, { status: 500 }); }
  if (url.protocol !== "https:") return NextResponse.json({ error: "Payment links must use https." }, { status: 500 });
  url.searchParams.set("client_reference_id", ctx.orgId);
  return NextResponse.redirect(url.toString(), 303);
}
