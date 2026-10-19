import { Notice } from "@/components/ui";

export const metadata = { title: "Configuration required" };

export default function Setup() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Configuration required</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-500">
        <Notice tone="amber" title="Supabase is not configured">
          Copy <code>.env.example</code> to <code>.env.local</code> and set <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>. Then apply <code>supabase/migrations/0001_factorypilot_schema.sql</code> and restart the server.
        </Notice>
        <p>AI features additionally need <code>GEMINI_API_KEY</code>. Payment links are read from <code>PROFESSIONAL_PAYMENT_LINK</code> and <code>ENTERPRISE_PAYMENT_LINK</code>. See <code>docs/SETUP.md</code>.</p>
      </div>
    </>
  );
}
