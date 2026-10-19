import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embed } from "@/lib/ai/gemini";
import type { Ctx } from "@/lib/auth/session";

export type KnowledgeInput = {
  title: string; body: string; kind: "handover_entry" | "incident" | "maintenance" | "resolution" | "procedure" | "lesson" | "manual" | "note";
  verification?: "operator_reported" | "ai_interpretation" | "suggested_troubleshooting" | "technician_confirmed" | "supervisor_approved" | "verified_resolution";
  equipment_id?: string | null; source_table?: string; source_id?: string; fault_code?: string | null; shift_label?: string | null; occurred_at?: string;
};

/** Adds a reviewed operational record to the knowledge base. Embedding is best-effort; keyword search always works. */
export async function addKnowledge(ctx: Ctx, k: KnowledgeInput) {
  const sb = await createClient();
  const vec = await embed(`${k.title}\n${k.body}`);
  const { data, error } = await sb.from("knowledge_records").insert({
    org_id: ctx.orgId, created_by: ctx.userId, verification: "operator_reported", ...k,
    embedding: vec ? `[${vec.join(",")}]` : null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}
