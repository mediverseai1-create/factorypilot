import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { signUp } from "../actions";

export const metadata = { title: "Get started" };

export default function Signup() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Get started</h1>
      <p className="mt-2 text-ink-500">Create your account, then set up your plant. If a colleague invited you, sign up with the invited email to join their organisation.</p>
      <ActionForm action={signUp} className="mt-8 space-y-5">
        <div><label className="label" htmlFor="full_name">Full name</label><input id="full_name" name="full_name" autoComplete="name" required className="field" /></div>
        <div><label className="label" htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" /><p className="mt-1 text-[12px] text-ink-400">At least 8 characters.</p></div>
        <SubmitButton className="btn-primary w-full" pendingText="Creating account…">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-[15px] text-ink-500">Already have an account? <Link href="/login" className="font-semibold text-ink underline">Sign in</Link></p>
    </>
  );
}
