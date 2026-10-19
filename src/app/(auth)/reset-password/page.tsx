import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requestReset } from "../actions";

export const metadata = { title: "Reset password" };

export default function Reset() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Reset password</h1>
      <p className="mt-2 text-ink-500">We’ll email you a link to choose a new password.</p>
      <ActionForm action={requestReset} className="mt-8 space-y-5">
        <div><label className="label" htmlFor="email">Work email</label><input id="email" name="email" type="email" required className="field" /></div>
        <SubmitButton className="btn-dark w-full">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-[15px]"><Link href="/login" className="font-semibold underline">Back to sign in</Link></p>
    </>
  );
}
