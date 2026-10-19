import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function Logo({ light = false, size = 28 }: { light?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#fff" : "#0B1B2B"} />
        <path d="M8 22V10h9.5a3.5 3.5 0 010 7H12" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 22l4-4" stroke={light ? "#0B1B2B" : "#fff"} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className={clsx("text-[19px] font-extrabold tracking-tight", light ? "text-white" : "text-ink")}>FactoryPilot</span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-[16px] leading-relaxed text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, pad = true }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {title && (
        <header className="flex items-center justify-between border-b border-canvas-line px-5 py-4">
          <h2 className="text-[16px] font-bold">{title}</h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "red" | "amber" | "green" }) {
  return (
    <div className="card p-5">
      <p className="text-[13px] font-semibold text-ink-400">{label}</p>
      <p className={clsx("mt-1 text-[38px] font-extrabold leading-none tracking-tight", tone === "red" && "text-signal-red", tone === "amber" && "text-amber-700")}>{value}</p>
      {hint && <p className="mt-2 text-[13px] text-ink-400">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-canvas-soft text-ink-700", red: "bg-signal-redbg text-signal-red", amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-100",
  green: "bg-signal-greenbg text-signal-green", blue: "bg-signal-bluebg text-signal-blue",
};
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold", TONES[tone])}>{children}</span>;
}

export const priorityTone = (p: string) => (p === "critical" ? "red" : p === "high" ? "amber" : p === "medium" ? "blue" : "neutral");
export const statusTone = (s: string) =>
  ({ running: "green", degraded: "amber", stopped: "red", maintenance: "blue", unknown: "neutral", open: "amber", resolved: "green", acknowledged: "blue", assigned: "blue", awaiting_investigation: "amber", investigating: "blue" } as Record<string, string>)[s] ?? "neutral";

const VERIF: Record<string, { label: string; tone: string }> = {
  operator_reported: { label: "Operator-reported", tone: "neutral" },
  ai_interpretation: { label: "AI interpretation", tone: "amber" },
  suggested_troubleshooting: { label: "Suggested (unverified)", tone: "amber" },
  technician_confirmed: { label: "Technician-confirmed", tone: "blue" },
  supervisor_approved: { label: "Supervisor-approved", tone: "blue" },
  verified_resolution: { label: "Verified resolution", tone: "green" },
};
export const verificationLabel = (v: string) => VERIF[v]?.label ?? v;
export function VerificationBadge({ level }: { level: string }) {
  const v = VERIF[level] ?? { label: level, tone: "neutral" };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-ink/20 bg-canvas-soft px-6 py-10 text-center">
      <p className="text-[17px] font-bold">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-ink-500">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "amber", title, children }: { tone?: "amber" | "red" | "blue" | "green"; title?: string; children: ReactNode }) {
  const t = { amber: "border-amber/40 bg-amber-50", red: "border-signal-red/30 bg-signal-redbg", blue: "border-signal-blue/25 bg-signal-bluebg", green: "border-signal-green/25 bg-signal-greenbg" }[tone];
  return (
    <div className={clsx("rounded-xl border px-4 py-3 text-[14px] leading-relaxed", t)} role={tone === "red" ? "alert" : "status"}>
      {title && <p className="mb-0.5 font-bold">{title}</p>}
      {children}
    </div>
  );
}

export function LinkButton({ href, children, kind = "primary", small }: { href: string; children: ReactNode; kind?: "primary" | "dark" | "ghost"; small?: boolean }) {
  return <Link href={href} className={clsx(kind === "primary" ? "btn-primary" : kind === "dark" ? "btn-dark" : "btn-ghost", small && "btn-sm")}>{children}</Link>;
}

export function fmt(d?: string | null, withTime = true) {
  if (!d) return "—";
  const x = new Date(d);
  return x.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
}
export const mins = (m?: number | null) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`);
