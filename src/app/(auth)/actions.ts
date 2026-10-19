"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/action-form";

const creds = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(8, "Password must be at least 8 characters") });

async function origin() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
const safeNext = (n: FormDataEntryValue | null) => (typeof n === "string" && n.startsWith("/app") ? n : "/app");

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(p.data);
  if (error) return { error: error.message };
  redirect(safeNext(fd.get("next")));
}

export async function signUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const p = creds.safeParse({ email: fd.get("email"), password: fd.get("password") });
  const name = String(fd.get("full_name") ?? "").trim();
  if (!p.success) return { error: p.error.issues[0].message };
  if (!name) return { error: "Enter your name" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...p.data, options: { data: { full_name: name }, emailRedirectTo: `${await origin()}/auth/callback` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = z.string().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "Enter a valid email" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, { redirectTo: `${await origin()}/auth/callback?next=/reset-password/update` });
  if (error) return { error: error.message };
  return { message: "If that account exists, a reset link is on its way." };
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const pw = z.string().min(8, "Password must be at least 8 characters").safeParse(fd.get("password"));
  if (!pw.success) return { error: pw.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  if (error) return { error: error.message };
  redirect("/app");
}

export async function createOrganization(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = z.string().trim().min(2, "Enter your organisation name").safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };
  const supabase = await createClient();
  const { data: org, error } = await supabase.rpc("create_organization", { p_name: name.data, p_industry: String(fd.get("industry") ?? "") || null });
  if (error) return { error: error.message };
  const fac = String(fd.get("facility") ?? "").trim();
  if (fac) {
    const { data: f } = await supabase.from("facilities").insert({ org_id: org, name: fac }).select("id").single();
    const line = String(fd.get("line") ?? "").trim();
    if (f && line) await supabase.from("production_lines").insert({ org_id: org, facility_id: f.id, name: line });
    if (f) {
      await supabase.from("shifts").insert([
        { org_id: org, facility_id: f.id, name: "Morning", start_time: "06:00", end_time: "14:00" },
        { org_id: org, facility_id: f.id, name: "Afternoon", start_time: "14:00", end_time: "22:00" },
        { org_id: org, facility_id: f.id, name: "Night", start_time: "22:00", end_time: "06:00" },
      ]);
    }
  }
  redirect("/app");
}

export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const { error } = await supabase.from("profiles").update({ full_name: String(fd.get("full_name") ?? "").trim(), job_title: String(fd.get("job_title") ?? "").trim() || null }).eq("id", user.id);
  return error ? { error: error.message } : { message: "Profile saved" };
}
