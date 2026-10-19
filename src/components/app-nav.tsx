"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useState } from "react";

export const NAV_PRIMARY = [
  { href: "/app", label: "Overview" },
  { href: "/app/handovers", label: "Shift Handovers" },
  { href: "/app/equipment", label: "Equipment" },
  { href: "/app/downtime", label: "Downtime Intelligence" },
  { href: "/app/knowledge", label: "Knowledge Base" },
];
export const NAV_SECONDARY = [
  { href: "/app/briefings", label: "Shift Briefings" },
  { href: "/app/incidents", label: "Incident Log" },
  { href: "/app/maintenance", label: "Maintenance & Work Orders" },
  { href: "/app/investigations", label: "Investigations" },
  { href: "/app/actions", label: "Actions & Follow-ups" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/agents", label: "AI Agents" },
  { href: "/app/data", label: "Data & Integrations" },
  { href: "/app/team", label: "Team & Permissions" },
  { href: "/app/billing", label: "Usage & Billing" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  const item = (n: { href: string; label: string }, strong: boolean) => (
    <Link
      key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active(n.href) ? "page" : undefined}
      className={clsx("block rounded-lg px-3 py-2 transition", strong ? "text-[15px] font-bold" : "text-[14px] font-medium",
        active(n.href) ? "bg-ink text-white" : "text-ink-700 hover:bg-canvas-soft")}
    >{n.label}</Link>
  );
  return (
    <>
      <button className="btn-ghost btn-sm lg:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
      <nav aria-label="Application" className={clsx("w-full shrink-0 lg:block lg:w-64", open ? "block" : "hidden")}>
        <div className="space-y-1">{NAV_PRIMARY.map((n) => item(n, true))}</div>
        <p className="mb-1 mt-6 px-3 text-[11px] font-bold uppercase tracking-wider text-ink-300">Operations</p>
        <div className="space-y-0.5">{NAV_SECONDARY.map((n) => item(n, false))}</div>
      </nav>
    </>
  );
}
