"use server";
import { need } from "@/lib/action-utils";
import { searchKnowledge, type KnowledgeResult } from "@/lib/ai/agents";

export type AskState = { error?: string; result?: KnowledgeResult; runId?: string; question?: string } | undefined;

export async function askKnowledge(_: AskState, fd: FormData): Promise<AskState> {
  try {
    const ctx = await need("knowledge.search");
    const question = String(fd.get("question") ?? "").trim();
    if (question.length < 4) return { error: "Ask a full question, e.g. “Has Press 3 had similar stoppages?”" };
    const equipmentId = String(fd.get("equipment_id") ?? "") || undefined;
    const { data, runId } = await searchKnowledge(ctx, question, equipmentId);
    return { result: data, runId, question };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Search failed" };
  }
}
