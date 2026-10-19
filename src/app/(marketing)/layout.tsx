import Link from "next/link";
import { Logo } from "@/components/ui";

const NAV = [
  { href: "/#platform", label: "Platform" },
  { href: "/#shift", label: "Shift Intelligence" },
  { href: "/#downtime", label: "Downtime Intelligence" },
  { href: "/#knowledge", label: "Knowledge Base" },
  { href: "/#pricing", label: "Pricing" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-canvas-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1280px] items-center justify-between px-6">
          <Link href="/" aria-label="FactoryPilot home"><Logo /></Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 whitespace-nowrap xl:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-[15px] font-semibold text-ink-700 hover:text-amber-700">{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <details className="relative xl:hidden">
              <summary className="btn-ghost btn-sm cursor-pointer list-none">Menu</summary>
              <div className="absolute right-0 top-12 w-64 rounded-xl border border-canvas-line bg-white p-2 shadow-card">
                {NAV.map((n) => (<Link key={n.href} href={n.href} className="block rounded-lg px-4 py-2.5 text-[15px] font-semibold hover:bg-canvas-soft">{n.label}</Link>))}
                <Link href="/login" className="block rounded-lg px-4 py-2.5 text-[15px] font-semibold hover:bg-canvas-soft">Sign in</Link>
              </div>
            </details>
            <Link href="/login" className="hidden px-3 text-[15px] font-semibold text-ink-700 hover:text-amber-700 sm:block">Sign in</Link>
            <Link href="/signup" className="btn-primary btn-sm">Get started</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-ink text-white">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-16 md:grid-cols-5">
          <div className="md:col-span-2">
            <Logo light />
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">Every shift connected. Every lesson preserved.</p>
          </div>
          {[
            { h: "Platform", l: [["Shift handovers", "/#shift"], ["Downtime intelligence", "/#downtime"], ["Knowledge base", "/#knowledge"], ["How it works", "/#how"]] },
            { h: "For teams", l: [["Operators", "/#teams"], ["Supervisors", "/#teams"], ["Maintenance", "/#teams"], ["Plant managers", "/#teams"]] },
            { h: "Get started", l: [["Pricing", "/#pricing"], ["Sign in", "/login"], ["Create account", "/signup"]] },
          ].map((c) => (
            <div key={c.h}>
              <p className="text-[13px] font-bold uppercase tracking-wider text-white/50">{c.h}</p>
              <ul className="mt-4 space-y-2.5">
                {c.l.map(([t, h]) => (<li key={t}><Link href={h} className="text-[15px] text-white/85 hover:text-amber">{t}</Link></li>))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10 py-6 text-center text-[13px] text-white/50">
          © {new Date().getFullYear()} FactoryPilot · factorypilot.click · AI output supports, and never replaces, qualified technicians and site safety procedures.
        </div>
      </footer>
    </>
  );
}
