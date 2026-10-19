export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  get serviceRole() { return process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""; },
  get gemini() { return process.env.GEMINI_API_KEY ?? ""; },
  get geminiModel() { return process.env.GEMINI_MODEL || "gemini-3.8-flash"; },
  get embeddingModel() { return process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001"; },
  get professionalLink() { return process.env.PROFESSIONAL_PAYMENT_LINK ?? ""; },
  get enterpriseLink() { return process.env.ENTERPRISE_PAYMENT_LINK ?? ""; },
  get webhookSecret() { return process.env.PAYMENT_WEBHOOK_SECRET ?? ""; },
};
export const supabaseConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnon);
export const geminiConfigured = () => Boolean(env.gemini);
