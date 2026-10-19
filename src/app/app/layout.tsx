import Link from "next/link";
import { getCtx } from "@/lib/auth/session";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { AppNav } from "@/components/app-nav";
import { Logo } from "@/components/ui";
import { signOut } from "../(auth)/actions";
import { getEntitlement } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const ent = await getEntitlement(ctx.orgId);
  const low = ent.allowanceConfigured && ent.balance <= 10;
  return (
    <div className="min-h-screen bg-canvas-soft">
      <header className="sticky top-0 z-30 border-b border-canvas-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/app" aria-label="Overview"><Logo /></Link>
            <span className="hidden border-l border-canvas-line pl-6 text-[14px] font-semibold text-ink-500 md:block">{ctx.orgName}</span>
          </div>
          <div className="flex items-center gap-3">
            {ent.status !== "active" && <Link href="/app/billing" className="hidden rounded-full bg-amber-50 px-3 py-1 text-[12px] font-bold text-amber-700 ring-1 ring-amber-100 sm:block">No active plan</Link>}
            {low && <Link href="/app/billing" className="rounded-full bg-signal-redbg px-3 py-1 text-[12px] font-bold text-signal-red">Low credits: {ent.balance}</Link>}
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-bold leading-tight">{ctx.fullName}</p>
              <p className="text-[12px] leading-tight text-ink-400">{ROLE_LABEL[ctx.role]}</p>
            </div>
            <form action={signOut}><button className="btn-ghost btn-sm">Sign out</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8">
        <AppNav />
        <main id="main" className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
