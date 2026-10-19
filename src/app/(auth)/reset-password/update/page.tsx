import { ActionForm, SubmitButton } from "@/components/action-form";
import { updatePassword } from "../../actions";

export const metadata = { title: "Choose a new password" };

export default function UpdatePassword() {
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Choose a new password</h1>
      <ActionForm action={updatePassword} className="mt-8 space-y-5">
        <div><label className="label" htmlFor="password">New password</label><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="field" /></div>
        <SubmitButton className="btn-dark w-full">Update password</SubmitButton>
      </ActionForm>
    </>
  );
}
