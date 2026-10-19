export type PlanId = "professional" | "enterprise";

export type Feature =
  | "handover_generation" | "voice_transcription" | "knowledge_search" | "downtime_analysis" | "investigation"
  | "work_order_draft" | "briefing" | "report" | "improvement_review";

/**
 * Relative metering weight per AI action. These are units of consumption, NOT allowances:
 * final monthly credit quantities are supplied via PROFESSIONAL_MONTHLY_CREDITS / ENTERPRISE_MONTHLY_CREDITS.
 */
export const FEATURE_COST: Record<Feature, number> = {
  handover_generation: 1, voice_transcription: 1, knowledge_search: 1, downtime_analysis: 2, investigation: 2,
  work_order_draft: 1, briefing: 1, report: 1, improvement_review: 2,
};

export const FEATURE_LABEL: Record<Feature, string> = {
  handover_generation: "Handover generation", voice_transcription: "Voice processing", knowledge_search: "Knowledge search",
  downtime_analysis: "Downtime analysis", investigation: "AI investigation", work_order_draft: "Work-order drafting",
  briefing: "Shift briefing", report: "Reports", improvement_review: "Continuous improvement review",
};

export const PLANS: Record<PlanId, { name: string; price: number; blurb: string; features: string[]; advancedAnalytics: boolean }> = {
  professional: {
    name: "Professional", price: 57, advancedAnalytics: false,
    blurb: "For a plant team that needs reliable shift handovers and a searchable knowledge base.",
    features: ["AI shift handover generation", "Voice and text capture", "Shift briefings and continuity tracking", "Industrial knowledge base search",
      "Equipment registry and downtime intelligence", "Investigations and work-order drafts", "CSV data import"],
  },
  enterprise: {
    name: "Enterprise", price: 97, advancedAnalytics: true,
    blurb: "For multi-line operations that want advanced analytics and improvement tracking.",
    features: ["Everything in Professional", "Advanced analytics and Continuous Improvement agent", "Operations briefings for managers",
      "Higher team, facility and line capacity (limits set at activation)", "Priority onboarding for integrations"],
  },
};

export const ADVANCED_FEATURES: Feature[] = ["improvement_review"];
