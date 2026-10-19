"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/auth/session";
import { need, toState } from "@/lib/action-utils";
import { buildReport, REPORT_KINDS, type ReportKind } from "@/lib/reports";
import type { ActionState } from "@/components/action-form";

export async function generateStoredReport(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const ctx = await need("capture");
    const kind = String(fd.get("kind")) as ReportKind;
    if (!(kind in REPORT_KINDS)) throw new Error("Unknown report type");
    const days = Math.min(365, Math.max(1, Number(fd.get("days")) || 7));
    const content = await buildReport(ctx.orgId, kind, days);
    const sb = await createClient();
    const { data, error } = await sb.from("reports").insert({ org_id: ctx.orgId, kind, period_start: content.period.start, period_end: content.period.end, content, generated_by: ctx.userId }).select("id").single();
    if (error) throw new Error(error.message);
    id = data.id;
    await audit(ctx, "report.generated", "reports", id, { kind, days });
  } catch (e) { return toState(e); }
  redirect(`/app/reports?id=${id}`);
}
