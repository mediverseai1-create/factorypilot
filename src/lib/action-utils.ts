import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getCtx, type Ctx } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import type { ActionState } from "@/components/action-form";

export class Denied extends Error {}

/** Resolve context and enforce a UI-level permission (RLS remains the authoritative check). */
export async function need(p: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!can(ctx.role, p)) throw new Denied("Your role does not permit this action.");
  return ctx;
}

export function toState(e: unknown): ActionState {
  if (isRedirectError(e)) throw e;
  return { error: e instanceof Error ? e.message : "Something went wrong" };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const opt = (fd: FormData, k: string) => str(fd, k) || null;
export const num = (fd: FormData, k: string) => { const v = str(fd, k); return v === "" ? null : Number(v); };
export const iso = (fd: FormData, k: string) => { const v = str(fd, k); return v ? new Date(v).toISOString() : null; };
