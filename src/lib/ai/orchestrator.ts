import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertEntitled, charge } from "@/lib/billing/credits";
import type { Feature } from "@/lib/billing/plans";
import type { Ctx } from "@/lib/auth/session";
import { AiNotConfiguredError, type Usage } from "./gemini";
import { geminiConfigured } from "@/lib/env";

export const AGENTS = {
  shift_handover: { name: "Shift Handover Agent", role: "Converts operator notes into structured handovers and prepares incoming-shift briefings." },
  industrial_knowledge: { name: "Industrial Knowledge Agent", role: "Searches historical records and returns evidence-backed answers." },
  downtime_intelligence: { name: "Downtime Intelligence Agent", role: "Analyses stoppage patterns and recurring equipment issues." },
  maintenance_intelligence: { name: "Maintenance Intelligence Agent", role: "Reviews maintenance history; prepares investigation recommendations and work-order drafts." },
  incident_investigation: { name: "Incident Investigation Agent", role: "Organises evidence, identifies related events and supports root-cause investigations." },
  shift_continuity: { name: "Shift Continuity Agent", role: "Tracks unresolved issues, ownership, acknowledgement and follow-up across shifts." },
  operations_briefing: { name: "Operations Briefing Agent", role: "Summarises the most important operational information for supervisors and managers." },
  continuous_improvement: { name: "Continuous Improvement Agent", role: "Evaluates confirmed resolutions and outcomes to identify recurring issues." },
} as const;
export type AgentId = keyof typeof AGENTS;

export type AgentResult<T> = { runId: string; data: T };

/**
 * Single entry point for every AI action: entitlement check -> run record -> execution -> metering -> audit.
 * `fn` receives the run id and returns the result plus token usage (or null usage when no model call was made,
 * in which case nothing is charged).
 */
export async function runAgent<T>(ctx: Ctx, opts: {
  agent: AgentId; feature: Feature; task: string; inputSummary: string;
  fn: (runId: string) => Promise<{ data: T; usage: Usage | null }>;
}): Promise<AgentResult<T>> {
  if (!geminiConfigured()) throw new AiNotConfiguredError();
  await assertEntitled(ctx.orgId, opts.feature);
  const sb = await createClient();
  const admin = createAdminClient();
  const { data: run, error } = await admin.from("ai_agent_runs").insert({
    org_id: ctx.orgId, user_id: ctx.userId, agent: opts.agent, task: opts.task, input_summary: opts.inputSummary.slice(0, 500), status: "running",
  }).select("id").single();
  if (error || !run) throw new Error(`Could not record agent run: ${error?.message}`);
  try {
    const { data, usage } = await opts.fn(run.id);
    await admin.from("ai_agent_runs").update({
      status: "succeeded", output: data as object, model: usage?.model, prompt_tokens: usage?.promptTokens, output_tokens: usage?.outputTokens,
    }).eq("id", run.id);
    if (usage) await charge(ctx.orgId, ctx.userId, opts.feature, run.id);
    await sb.from("activity_logs").insert({ org_id: ctx.orgId, actor_id: ctx.userId, action: `ai.${opts.agent}`, entity_table: "ai_agent_runs", entity_id: run.id, detail: { task: opts.task } });
    return { runId: run.id, data };
  } catch (e) {
    await admin.from("ai_agent_runs").update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : "error" }).eq("id", run.id);
    throw e;
  }
}

/** Intent routing for the shared Ask box: decides which agent handles a free-text request. */
export function routeIntent(text: string): AgentId {
  const t = text.toLowerCase();
  if (/(root cause|why did|investigat|diagnos)/.test(t)) return "incident_investigation";
  if (/(work order|draft.*maintenance|schedule maintenance)/.test(t)) return "maintenance_intelligence";
  if (/(downtime|stoppage|recurring|pattern|how often)/.test(t)) return "downtime_intelligence";
  if (/(carried over|unresolved|overdue|open issues|handover from|last shift|previous shift)/.test(t)) return "shift_continuity";
  if (/(improv|recurr.*after|did the fix)/.test(t)) return "continuous_improvement";
  return "industrial_knowledge";
}
