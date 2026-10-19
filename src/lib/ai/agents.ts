import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Ctx } from "@/lib/auth/session";
import { embed, generateStructured } from "./gemini";
import { runAgent } from "./orchestrator";
import { equipmentRecords, loadEquipment, openTasks } from "./context";
import {
  briefingSchema, downtimeAnalysis, handoverReport, investigationAnalysis, knowledgeAnswer, workOrderDraft,
  type HandoverReport,
} from "./schemas";
import {
  formatContext, keepKnown, mentionedEquipment, recId, resolveEquipment, verifyQuote, type ContextRecord,
} from "@/lib/grounding";
import { computeStats, type DtEvent } from "@/lib/downtime";
import { SAFETY_NOTICE } from "./safety";

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

/* ───────────── Shift Handover Agent ───────────── */
export type StoredReport = HandoverReport & {
  meta: {
    generated_at: string; model: string; run_id: string;
    equipment_map: Record<string, { id: string; name: string } | null>;
    quote_check: { verified: number; unverified: number };
    continuity: { open_items_before: number; open_same_line: number; prior_incidents: { equipment: string; count: number; latest: string | null }[] };
  };
};

export async function generateHandoverReport(ctx: Ctx, handoverId: string) {
  const sb = await createClient();
  const { data: h } = await sb.from("handovers").select("*").eq("id", handoverId).eq("org_id", ctx.orgId).single();
  if (!h) throw new Error("Handover not found");
  if (!h.source_notes.trim()) throw new Error("Add operator notes before generating the handover.");

  return runAgent(ctx, {
    agent: "shift_handover", feature: "handover_generation", task: "Generate structured handover", inputSummary: h.source_notes,
    fn: async (runId) => {
      const equipment = await loadEquipment(sb, ctx.orgId);
      const mentioned = mentionedEquipment(h.source_notes, equipment);
      const [tasks, prev] = await Promise.all([
        openTasks(sb, ctx.orgId, 25),
        sb.from("handovers").select("id,shift_label,shift_date,report").eq("org_id", ctx.orgId).eq("status", "submitted").neq("id", handoverId).order("submitted_at", { ascending: false }).limit(3),
      ]);
      const records: ContextRecord[] = [];
      for (const e of mentioned.slice(0, 6)) records.push(...(await equipmentRecords(sb, ctx.orgId, e.id, 6)));
      tasks.forEach((t) => records.push({ id: recId("task", t.id), kind: "open_follow_up", date: t.created_at, text: `${t.title}. ${t.detail ?? ""} status=${t.status} priority=${t.priority}` }));
      prev.data?.forEach((p) => records.push({ id: recId("handover", p.id), kind: "previous_handover", date: `${p.shift_date}`, text: `${p.shift_label ?? ""} ${(p.report as { summary?: string } | null)?.summary ?? ""}` }));
      const known = new Set(records.map((r) => r.id));

      const prompt = `OPERATOR NOTES (verbatim, the only source of today's events):\n"""\n${h.source_notes}\n"""\n\nKNOWN EQUIPMENT (name / identifier): ${equipment.map((e) => `${e.name} / ${e.identifier}`).join("; ") || "none registered"}\n\nCONTEXT RECORDS (stored history; cite by id):\n${formatContext(records.slice(0, 60))}\n\nProduce the structured handover. Only include sections that apply. Put each unresolved item in "issues". List what is missing or ambiguous in missing_information. Never promote history to a current event.`;

      const { data, usage } = await generateStructured({
        schema: handoverReport, task: "Convert operator shift notes into a structured, evidence-linked handover report.", prompt,
      });

      // deterministic grounding
      let verified = 0, unverified = 0;
      const check = <T extends { evidence_quote?: string; source_quote?: string }>(x: T, k: "evidence_quote" | "source_quote") => {
        const q = x[k] ?? "";
        if (!q) return;
        if (verifyQuote(q, h.source_notes)) { verified++; return; }
        unverified++;
        (x as Record<string, unknown>)[k] = `${q} [quote not found in notes]`;
      };
      data.machine_events.forEach((m) => check(m, "evidence_quote"));
      data.sections.forEach((s) => s.items.forEach((i) => check(i, "evidence_quote")));
      data.issues.forEach((i) => check(i, "source_quote"));
      data.related_history = data.related_history.filter((r) => known.has(r.record_id));

      const refs = new Set<string>();
      data.machine_events.forEach((m) => refs.add(m.equipment_ref));
      data.issues.forEach((i) => i.equipment_ref && refs.add(i.equipment_ref));
      data.sections.forEach((s) => s.items.forEach((i) => i.equipment_ref && refs.add(i.equipment_ref)));
      const equipment_map: StoredReport["meta"]["equipment_map"] = {};
      refs.forEach((r) => { const e = resolveEquipment(r, equipment); equipment_map[r] = e ? { id: e.id, name: e.name } : null; });
      const unresolved = [...refs].filter((r) => !equipment_map[r]);
      unresolved.forEach((r) => data.confirmation_flags.push(`"${r}" does not match a registered machine: confirm the machine or register it.`));

      const resolvedIds = [...new Set(Object.values(equipment_map).filter(Boolean).map((e) => e!.id))];
      const lineIds = new Set(equipment.filter((e) => resolvedIds.includes(e.id)).map((e) => e.line_id).filter(Boolean));
      const priorIncidents: StoredReport["meta"]["continuity"]["prior_incidents"] = [];
      for (const id of resolvedIds) {
        const { data: inc } = await sb.from("incidents").select("occurred_at").eq("org_id", ctx.orgId).eq("equipment_id", id).gte("occurred_at", daysAgo(90)).neq("handover_id", handoverId).order("occurred_at", { ascending: false });
        if (inc?.length) priorIncidents.push({ equipment: equipment.find((e) => e.id === id)!.name, count: inc.length, latest: inc[0].occurred_at });
      }
      const meta: StoredReport["meta"] = {
        generated_at: new Date().toISOString(), model: usage.model, run_id: runId, equipment_map, quote_check: { verified, unverified },
        continuity: {
          open_items_before: tasks.length,
          open_same_line: tasks.filter((t) => { const e = equipment.find((x) => x.id === t.equipment_id); return e && lineIds.has(e.line_id); }).length,
          prior_incidents: priorIncidents,
        },
      };
      const report: StoredReport = { ...data, meta };
      const { error } = await sb.from("handovers").update({ report, ai_run_id: runId, updated_at: new Date().toISOString() }).eq("id", handoverId);
      if (error) throw new Error(error.message);
      await sb.from("handover_edits").insert({ org_id: ctx.orgId, handover_id: handoverId, editor_id: ctx.userId, summary: "AI report generated from operator notes", after: { run_id: runId } });
      return { data: report, usage };
    },
  });
}

/* ───────────── Shift Continuity / Briefing ───────────── */
export async function generateBriefing(ctx: Ctx) {
  const sb = await createClient();
  return runAgent(ctx, {
    agent: "shift_continuity", feature: "briefing", task: "Prepare incoming shift briefing", inputSummary: "Incoming shift briefing",
    fn: async () => {
      const [{ data: hs }, tasks, equipment] = await Promise.all([
        sb.from("handovers").select("id,shift_label,shift_date,submitted_at,report").eq("org_id", ctx.orgId).in("status", ["submitted", "acknowledged"]).order("submitted_at", { ascending: false }).limit(3),
        openTasks(sb, ctx.orgId, 40),
        loadEquipment(sb, ctx.orgId),
      ]);
      if (!hs?.length && !tasks.length) throw new Error("No submitted handovers or open issues yet: nothing to brief.");
      const now = Date.now();
      const records: ContextRecord[] = [];
      hs?.forEach((h) => records.push({ id: recId("handover", h.id), kind: "approved_handover", date: h.submitted_at ?? h.shift_date, text: `${h.shift_label ?? ""} ${JSON.stringify((h.report as { summary?: string; issues?: unknown } | null) ?? {}).slice(0, 1200)}` }));
      tasks.forEach((t) => records.push({
        id: recId("task", t.id), kind: "open_follow_up", date: t.created_at,
        text: `${t.title}. ${t.detail ?? ""} status=${t.status} priority=${t.priority} carried_shifts=${t.shifts_carried} equipment=${equipment.find((e) => e.id === t.equipment_id)?.name ?? "n/a"} escalated=${t.escalated} ${t.due_at && new Date(t.due_at).getTime() < now ? "OVERDUE" : ""}`,
      }));
      const known = new Set(records.map((r) => r.id));
      const { data, usage } = await generateStructured({
        schema: briefingSchema, task: "Prepare a briefing for the incoming shift using ONLY these approved handovers and open follow-ups.",
        prompt: `CONTEXT RECORDS:\n${formatContext(records)}\n\nAnswer: what happened last shift; what is unresolved; which machines need attention; what is overdue; what recurred; what to watch for; what needs acknowledgement; what needs escalation. State limitations where the data is thin.`,
      });
      data.unresolved.forEach((u) => { if (u.ref_id && !known.has(u.ref_id)) u.ref_id = null; });
      data.recurring.forEach((r) => { r.record_ids = keepKnown(r.record_ids, known); });
      await sb.from("reports").insert({ org_id: ctx.orgId, kind: "shift_briefing", period_start: daysAgo(1), period_end: new Date().toISOString(), content: data, generated_by: ctx.userId });
      return { data, usage };
    },
  });
}

/* ───────────── Industrial Knowledge Agent ───────────── */
export type KnowledgeResult = {
  answerable: boolean; answer: string; caveats: string[]; unverified_suggestions: string[];
  sources: { id: string; title: string; kind: string; verification: string; occurred_at: string; equipment_id: string | null; snippet: string; supports?: string }[];
  mode: "semantic+keyword" | "keyword";
};

export async function searchKnowledge(ctx: Ctx, question: string, equipmentId?: string) {
  const sb = await createClient();
  return runAgent<KnowledgeResult>(ctx, {
    agent: "industrial_knowledge", feature: "knowledge_search", task: "Evidence-backed knowledge answer", inputSummary: question,
    fn: async () => {
      const vec = await embed(question);
      const { data: hits, error } = await sb.rpc("search_knowledge", {
        p_org: ctx.orgId, p_query: question, p_embedding: vec ? `[${vec.join(",")}]` : null, p_equipment: equipmentId ?? null, p_limit: 10,
      });
      if (error) throw new Error(error.message);
      const mode = vec ? "semantic+keyword" : "keyword";
      if (!hits?.length) {
        return { usage: null, data: { answerable: false, answer: "No stored records matched this question, so FactoryPilot cannot answer it from your knowledge base. No procedure has been invented.", caveats: [], unverified_suggestions: [], sources: [], mode } };
      }
      const records: ContextRecord[] = hits.map((h: { id: string; kind: string; verification: string; occurred_at: string; title: string; body: string }) => ({
        id: recId("knowledge", h.id), kind: `${h.kind}; verification=${h.verification}`, date: h.occurred_at, text: `${h.title}. ${h.body}`,
      }));
      const { data, usage } = await generateStructured({
        schema: knowledgeAnswer, task: "Answer the question using ONLY the supplied knowledge records. Mark verification level of what you rely on. If they do not answer it, set answerable=false.",
        prompt: `QUESTION: ${question}\n\nCONTEXT RECORDS:\n${formatContext(records)}`,
      });
      const known = new Set(records.map((r) => r.id));
      const cites = data.citations.filter((c) => known.has(c.record_id));
      const answerable = data.answerable && cites.length > 0;
      const sources = hits.map((h: { id: string; title: string; kind: string; verification: string; occurred_at: string; equipment_id: string | null; body: string }) => ({
        id: h.id, title: h.title, kind: h.kind, verification: h.verification, occurred_at: h.occurred_at, equipment_id: h.equipment_id,
        snippet: h.body.slice(0, 280), supports: cites.find((c) => c.record_id === recId("knowledge", h.id))?.supports,
      }));
      const caveats = [...data.caveats];
      if (data.answerable && !cites.length) caveats.push("The model produced an answer without valid citations; it has been withheld.");
      return {
        usage,
        data: {
          answerable, answer: answerable ? data.answer : "The stored records do not contain a reliable answer to this question. Closest records are listed below for manual review.",
          caveats, unverified_suggestions: answerable ? data.unverified_suggestions : [], sources, mode,
        },
      };
    },
  });
}

/* ───────────── Downtime Intelligence Agent ───────────── */
export async function analyzeDowntime(ctx: Ctx, opts: { equipmentId?: string; days?: number }) {
  const sb = await createClient();
  const days = opts.days ?? 90;
  return runAgent(ctx, {
    agent: "downtime_intelligence", feature: "downtime_analysis", task: "Analyse stoppage patterns", inputSummary: `last ${days}d ${opts.equipmentId ?? "all equipment"}`,
    fn: async () => {
      let q = sb.from("downtime_events").select("id,equipment_id,started_at,ended_at,duration_minutes,fault_code,shift_label,context,cause_category,notes").eq("org_id", ctx.orgId).gte("started_at", daysAgo(days)).order("started_at", { ascending: false }).limit(300);
      if (opts.equipmentId) q = q.eq("equipment_id", opts.equipmentId);
      const { data: events } = await q;
      if (!events || events.length < 2) throw new Error("Fewer than two downtime events in this period: not enough data for pattern analysis.");
      const equipment = await loadEquipment(sb, ctx.orgId);
      const stats = computeStats(events as DtEvent[]);
      const name = (id: string | null) => equipment.find((e) => e.id === id)?.name ?? "unassigned";
      const records: ContextRecord[] = events.map((e) => ({
        id: recId("downtime", e.id), kind: "downtime_event", date: e.started_at,
        text: `equipment=${name(e.equipment_id)} duration_min=${e.duration_minutes ?? "unknown"} fault=${e.fault_code ?? ""} shift=${e.shift_label ?? ""} context=${e.context ?? ""} cause=${e.cause_category ?? ""} ${e.notes ?? ""}`,
      }));
      const known = new Set(records.map((r) => r.id));
      const precomputed = JSON.stringify({
        total_events: stats.total, events_with_duration: stats.withDuration,
        recurring: stats.recurring.map((r) => ({ equipment: name(r.equipmentId), fault: r.faultCode, count: r.count })),
        by_shift: stats.byShift, repeated_context: stats.contextRepeats.map((c) => ({ equipment: name(c.equipmentId), context: c.context, count: c.count })),
      });
      const { data, usage } = await generateStructured({
        schema: downtimeAnalysis, task: "Identify recurring faults and stoppage patterns from stored downtime events. Do not predict failures or claim accuracy; flag inspection candidates and state data limitations.",
        prompt: `PRECOMPUTED STATISTICS (authoritative):\n${precomputed}\n\nEVENTS:\n${formatContext(records.slice(0, 120))}`,
      });
      data.recurring_faults.forEach((r) => { r.record_ids = keepKnown(r.record_ids, known); });
      data.patterns.forEach((p) => { p.record_ids = keepKnown(p.record_ids, known); });
      data.patterns = data.patterns.filter((p) => p.record_ids.length >= 2);
      data.inspection_flags.forEach((f) => { f.record_ids = keepKnown(f.record_ids, known); });
      await sb.from("ai_insights").insert({ org_id: ctx.orgId, equipment_id: opts.equipmentId ?? null, kind: "downtime_analysis", title: `Downtime analysis (${days} days)`, body: data });
      return { data, usage };
    },
  });
}

/* ───────────── Incident Investigation Agent ───────────── */
export async function analyzeInvestigation(ctx: Ctx, investigationId: string) {
  const sb = await createClient();
  const { data: inv } = await sb.from("investigations").select("*").eq("id", investigationId).eq("org_id", ctx.orgId).single();
  if (!inv) throw new Error("Investigation not found");
  return runAgent(ctx, {
    agent: "incident_investigation", feature: "investigation", task: "Organise investigation evidence", inputSummary: inv.title,
    fn: async () => {
      const records = inv.equipment_id ? await equipmentRecords(sb, ctx.orgId, inv.equipment_id, 15) : [];
      const { data: steps } = await sb.from("troubleshooting_steps").select("id,description,outcome,created_at").eq("investigation_id", investigationId);
      steps?.forEach((s) => records.push({ id: recId("step", s.id), kind: "troubleshooting_step", date: s.created_at, text: `${s.description} outcome=${s.outcome}` }));
      const known = new Set(records.map((r) => r.id));
      const { data, usage } = await generateStructured({
        schema: investigationAnalysis, task: "Support a root-cause investigation. Keep observed evidence, possible contributors and hypotheses strictly separate. Never assert a confirmed root cause. Next steps must be investigative and subject to qualified review.",
        prompt: `REPORTED PROBLEM: ${inv.reported_problem}\n\nCONTEXT RECORDS:\n${formatContext(records.slice(0, 70))}`,
      });
      data.observed_evidence = data.observed_evidence.filter((o) => !o.record_id || known.has(o.record_id));
      data.possible_contributors.forEach((c) => { c.record_ids = keepKnown(c.record_ids, known); });
      data.hypotheses.forEach((h) => { h.supporting_ids = keepKnown(h.supporting_ids, known); });
      data.prior_attempts = data.prior_attempts.filter((a) => !a.record_id || known.has(a.record_id));
      data.recommended_next_steps.forEach((s) => { s.requires_qualified_review = true; });

      const rows = [
        ...data.observed_evidence.map((o) => ({ kind: "observed_evidence", statement: o.statement, source_table: o.record_id?.split(":")[0] ?? null, source_id: o.record_id?.split(":")[1] ?? null })),
        ...data.possible_contributors.map((c) => ({ kind: "possible_contributor", statement: `${c.statement} (basis: ${c.basis})`, source_table: null, source_id: null })),
        ...data.hypotheses.map((h) => ({ kind: "root_cause_hypothesis", statement: `${h.statement}: to test: ${h.how_to_test}`, source_table: null, source_id: null })),
      ].map((r) => ({ ...r, org_id: ctx.orgId, investigation_id: investigationId, origin: "ai", review_status: "proposed", created_by: ctx.userId }));
      if (rows.length) await sb.from("investigation_evidence").insert(rows);
      await sb.from("investigations").update({ ai_analysis: data, status: inv.status === "open" ? "in_progress" : inv.status }).eq("id", investigationId);
      return { data, usage };
    },
  });
}

/* ───────────── Maintenance Intelligence Agent: work-order draft ───────────── */
export async function draftWorkOrder(ctx: Ctx, opts: { equipmentId: string; incidentId?: string; investigationId?: string }) {
  const sb = await createClient();
  return runAgent(ctx, {
    agent: "maintenance_intelligence", feature: "work_order_draft", task: "Draft maintenance work order", inputSummary: `equipment ${opts.equipmentId}`,
    fn: async () => {
      const [{ data: eq }, records] = await Promise.all([
        sb.from("equipment").select("name,identifier,maintenance_owner,operating_limits").eq("id", opts.equipmentId).eq("org_id", ctx.orgId).single(),
        equipmentRecords(sb, ctx.orgId, opts.equipmentId, 10),
      ]);
      if (!eq) throw new Error("Equipment not found");
      if (!records.length) throw new Error("No recorded history for this machine: record an incident or handover first.");
      const known = new Set(records.map((r) => r.id));
      const { data, usage } = await generateStructured({
        schema: workOrderDraft, task: "Draft a maintenance work order for human approval. Summarise only recorded symptoms, history and attempts; recommend an INSPECTION, not a repair conclusion. Include a lockout/tagout safety reminder; never instruct bypassing safety controls.",
        prompt: `EQUIPMENT: ${eq.name} (${eq.identifier}); operating limits: ${eq.operating_limits ?? "not recorded"}\n\nCONTEXT RECORDS:\n${formatContext(records.slice(0, 45))}`,
      });
      data.supporting_ids = keepKnown(data.supporting_ids, known);
      const { data: wo, error } = await sb.from("work_orders").insert({
        org_id: ctx.orgId, equipment_id: opts.equipmentId, incident_id: opts.incidentId ?? null, investigation_id: opts.investigationId ?? null,
        title: data.title, symptoms: data.symptoms, incident_history: data.incident_history, attempted_actions: data.attempted_actions,
        recommended_inspection: data.recommended_inspection, priority: data.priority,
        safety_notice: `${data.safety_notice}\n${SAFETY_NOTICE}`.trim(), assigned_team: data.suggested_team,
        assigned_to: eq.maintenance_owner, status: "pending_approval", ai_drafted: true, created_by: ctx.userId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      return { data: { ...data, work_order_id: wo.id }, usage };
    },
  });
}

/* ───────────── Operations Briefing + Continuous Improvement ───────────── */
export async function improvementReview(ctx: Ctx) {
  const sb = await createClient();
  return runAgent(ctx, {
    agent: "continuous_improvement", feature: "improvement_review", task: "Review resolution outcomes", inputSummary: "Resolution outcomes",
    fn: async () => {
      const { data: res } = await sb.from("confirmed_resolutions").select("*").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(60);
      if (!res || res.length < 2) throw new Error("Needs at least two confirmed resolutions to review outcomes.");
      const equipment = await loadEquipment(sb, ctx.orgId);
      const records: ContextRecord[] = res.map((r) => ({
        id: recId("resolution", r.id), kind: `confirmed_resolution(${r.verification_status})`, date: r.created_at,
        text: `equipment=${equipment.find((e) => e.id === r.equipment_id)?.name ?? "n/a"}. Problem: ${r.original_problem}. Root cause: ${r.root_cause ?? "not established"}. Resolution: ${r.resolution}. Parts: ${r.parts_replaced ?? ""}. TTR min: ${r.time_to_resolution_minutes ?? "unknown"}. Recurred: ${r.recurred_at ?? "no"}`,
      }));
      const known = new Set(records.map((r) => r.id));
      const { data, usage } = await generateStructured({
        schema: briefingSchema, task: "Identify recurring problems and fixes that did not hold, using only these resolutions. Place findings in 'recurring' (cite ids) and opportunities in 'watch_for'.",
        prompt: `RESOLUTIONS:\n${formatContext(records)}`,
      });
      data.recurring.forEach((r) => { r.record_ids = keepKnown(r.record_ids, known); });
      await sb.from("ai_insights").insert({ org_id: ctx.orgId, kind: "improvement_review", title: "Resolution outcome review", body: data });
      return { data, usage };
    },
  });
}
