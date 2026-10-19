import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { signIn } from "../actions";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Sign in</h1>
      <p className="mt-2 text-ink-500">Welcome back to FactoryPilot.</p>
      {sp.error && <p role="alert" className="mt-4 rounded-lg bg-signal-redbg px-3 py-2 text-sm text-signal-red">That link is invalid or has expired. Request a new one.</p>}
      <ActionForm action={signIn} className="mt-8 space-y-5">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div><label className="label" htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required className="field" /></div>
        <div>
          <div className="flex justify-between"><label className="label" htmlFor="password">Password</label><Link href="/reset-password" className="text-[13px] font-semibold text-amber-700 hover:underline">Forgot?</Link></div>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        <SubmitButton className="btn-dark w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-[15px] text-ink-500">New to FactoryPilot? <Link href="/signup" className="font-semibold text-ink underline">Get started</Link></p>
    </>
  );
}
