"use client";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";

export type ActionState = { error?: string; message?: string } | undefined;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className, pendingText = "Working…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx(className ?? "btn-primary")} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Server-action form with inline error / success feedback. */
export function ActionForm({ action, children, className }: { action: Action; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="mt-3 rounded-lg bg-signal-redbg px-3 py-2 text-[14px] font-medium text-signal-red">{state.error}</p>}
      {state?.message && <p role="status" className="mt-3 rounded-lg bg-signal-greenbg px-3 py-2 text-[14px] font-medium text-signal-green">{state.message}</p>}
    </form>
  );
}
