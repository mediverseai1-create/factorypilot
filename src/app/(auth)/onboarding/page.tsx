import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/env";
import { createOrganization } from "../actions";

export const metadata = { title: "Set up your plant" };

export default async function Onboarding() {
  if (!supabaseConfigured()) redirect("/setup");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await supabase.rpc("accept_pending_invites");
  const { count } = await supabase.from("organization_members").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/app");
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Set up your plant</h1>
      <p className="mt-2 text-ink-500">You’ll become the Owner. You can add facilities, lines and teammates later.</p>
      <ActionForm action={createOrganization} className="mt-8 space-y-5">
        <div><label className="label" htmlFor="name">Organisation name</label><input id="name" name="name" required className="field" /></div>
        <div><label className="label" htmlFor="industry">Industry (optional)</label><input id="industry" name="industry" className="field" placeholder="e.g. Metal stamping" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label" htmlFor="facility">First facility</label><input id="facility" name="facility" className="field" placeholder="Plant 1" /></div>
          <div><label className="label" htmlFor="line">First line</label><input id="line" name="line" className="field" placeholder="Line A" /></div>
        </div>
        <p className="text-[12px] text-ink-400">Creating a facility also adds three default shifts (06:00–14:00, 14:00–22:00, 22:00–06:00). Edit them in Settings.</p>
        <SubmitButton className="btn-primary w-full">Create organisation</SubmitButton>
      </ActionForm>
    </>
  );
}
