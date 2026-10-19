import Link from "next/link";
import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-14">
        <Link href="/" aria-label="FactoryPilot home"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">{children}</div>
      </div>
      <aside className="hidden flex-col justify-end bg-ink p-14 text-white lg:flex">
        <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-amber">FactoryPilot Shift</p>
        <p className="mt-4 max-w-md text-[34px] font-extrabold leading-tight tracking-tight">Every shift connected. Every lesson preserved.</p>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/65">Operator notes become structured handovers. Resolved faults become searchable, verified knowledge.</p>
      </aside>
    </div>
  );
}
