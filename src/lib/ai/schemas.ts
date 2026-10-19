import { z } from "zod";

export const priority = z.enum(["low", "medium", "high", "critical"]);
export const issueKind = z.enum(["issue", "maintenance", "safety", "quality", "material", "inspection", "other"]);
const str = z.string().default("");

export const SECTION_KEYS = [
  "production_status", "equipment_status", "faults_stoppages", "maintenance_activities", "outstanding_issues",
  "safety", "quality", "material_inventory", "actions_completed", "actions_outstanding", "escalations", "incoming_priorities",
] as const;
export const SECTION_TITLES: Record<(typeof SECTION_KEYS)[number], string> = {
  production_status: "Production status",
  equipment_status: "Machine and equipment status",
  faults_stoppages: "Faults and stoppages",
  maintenance_activities: "Maintenance activities",
  outstanding_issues: "Outstanding issues",
  safety: "Safety observations and unresolved safety flags",
  quality: "Quality concerns",
  material_inventory: "Material and inventory concerns",
  actions_completed: "Actions completed",
  actions_outstanding: "Actions outstanding",
  escalations: "Items requiring escalation",
  incoming_priorities: "Priorities for the incoming shift",
};

export const reportItem = z.object({
  text: z.string(),
  equipment_ref: z.string().nullable().default(null).describe("Machine name/identifier exactly as the operator wrote it, or null"),
  finding: z.enum(["reported", "confirmed_negative", "not_stated"]).default("reported")
    .describe("'confirmed_negative' ONLY if the operator explicitly said nothing was wrong; otherwise 'reported'. Use 'not_stated' for gaps."),
  evidence_quote: str.describe("Short verbatim quote from the operator notes supporting this item"),
  needs_confirmation: z.boolean().default(false),
});

export const handoverReport = z.object({
  summary: z.string(),
  machine_events: z.array(z.object({
    equipment_ref: z.string(), event: z.string(), context: str, action_taken: str, current_state: str,
    outstanding_concern: str, stoppage_count: z.number().nullable().default(null), duration_minutes: z.number().nullable().default(null),
    evidence_quote: str,
  })).default([]),
  sections: z.array(z.object({ key: z.enum(SECTION_KEYS), items: z.array(reportItem) })).default([]),
  issues: z.array(z.object({
    title: z.string(), detail: str, kind: issueKind.default("issue"), priority: priority.default("medium"),
    priority_reason: str, equipment_ref: z.string().nullable().default(null), source_quote: str,
    requires_escalation: z.boolean().default(false), suggested_follow_up: str,
  })).default([]),
  missing_information: z.array(z.string()).default([]),
  confirmation_flags: z.array(z.string()).default([]).describe("Things a human must confirm before submission"),
  related_history: z.array(z.object({ record_id: z.string(), note: z.string() })).default([])
    .describe("Only IDs present in the supplied CONTEXT records"),
});
export type HandoverReport = z.infer<typeof handoverReport>;

export const briefingSchema = z.object({
  headline: z.string(),
  what_happened: z.array(z.string()).default([]),
  unresolved: z.array(z.object({ text: z.string(), ref_id: z.string().nullable().default(null) })).default([]),
  machines_needing_attention: z.array(z.object({ equipment_ref: z.string(), reason: z.string() })).default([]),
  overdue: z.array(z.string()).default([]),
  recurring: z.array(z.object({ text: z.string(), record_ids: z.array(z.string()).default([]) })).default([]),
  watch_for: z.array(z.string()).default([]),
  needs_acknowledgement: z.array(z.string()).default([]),
  escalations: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});
export type Briefing = z.infer<typeof briefingSchema>;

export const knowledgeAnswer = z.object({
  answerable: z.boolean().describe("false if the supplied records do not support an answer"),
  answer: z.string(),
  citations: z.array(z.object({ record_id: z.string(), supports: z.string() })).default([]),
  caveats: z.array(z.string()).default([]),
  unverified_suggestions: z.array(z.string()).default([]).describe("Ideas not in records; must be labelled unverified"),
});
export type KnowledgeAnswer = z.infer<typeof knowledgeAnswer>;

export const downtimeAnalysis = z.object({
  summary: z.string(),
  recurring_faults: z.array(z.object({ description: z.string(), occurrences: z.number(), record_ids: z.array(z.string()) })).default([]),
  patterns: z.array(z.object({
    description: z.string(), basis: z.string(), record_ids: z.array(z.string()), strength: z.enum(["weak", "moderate", "strong"]),
  })).default([]),
  inspection_flags: z.array(z.object({ equipment_ref: z.string(), reason: z.string(), record_ids: z.array(z.string()) })).default([]),
  data_limitations: z.array(z.string()).default([]),
});
export type DowntimeAnalysis = z.infer<typeof downtimeAnalysis>;

export const investigationAnalysis = z.object({
  observed_evidence: z.array(z.object({ statement: z.string(), record_id: z.string().nullable().default(null) })).default([]),
  possible_contributors: z.array(z.object({ statement: z.string(), basis: z.string(), record_ids: z.array(z.string()).default([]) })).default([]),
  hypotheses: z.array(z.object({
    statement: z.string(), supporting_ids: z.array(z.string()).default([]), against_or_unknown: z.string().default(""), how_to_test: z.string(),
  })).default([]),
  missing_information: z.array(z.string()).default([]),
  recommended_next_steps: z.array(z.object({ step: z.string(), basis: z.string(), requires_qualified_review: z.boolean().default(true) })).default([]),
  prior_attempts: z.array(z.object({ statement: z.string(), outcome: z.string(), record_id: z.string().nullable().default(null) })).default([]),
});
export type InvestigationAnalysis = z.infer<typeof investigationAnalysis>;

export const workOrderDraft = z.object({
  title: z.string(), symptoms: z.string(), incident_history: z.string(), attempted_actions: z.string(),
  recommended_inspection: z.string(), priority, priority_reason: z.string(),
  safety_notice: z.string().describe("Reminder to follow site LOTO/isolation procedures. Never instructions to bypass controls."),
  suggested_team: z.string().nullable().default(null), supporting_ids: z.array(z.string()).default([]),
});
export type WorkOrderDraft = z.infer<typeof workOrderDraft>;
