import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { getEntitlement } from "@/lib/billing/credits";
import { FEATURE_COST, FEATURE_LABEL, PLANS, type Feature, type PlanId } from "@/lib/billing/plans";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, fmt } from "@/components/ui";

export const metadata = { title: "Usage & Billing" };

export default async function Billing() {
  const ctx = await getCtx();
  const sb = await createClient();
  const ent = await getEntitlement(ctx.orgId);
  const [{ data: usage }, { data: tx }, { data: sub }, { data: runs }] = await Promise.all([
    sb.from("ai_usage").select("feature,credits,created_at").eq("org_id", ctx.orgId).gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    can(ctx.role, "billing.view") ? sb.from("credit_transactions").select("delta,reason,created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(10) : Promise.resolve({ data: [] }),
    sb.from("subscriptions").select("*").eq("org_id", ctx.orgId).maybeSingle(),
    sb.from("ai_agent_runs").select("id,agent,task,status,created_at,error").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(10),
  ]);
  const by = new Map<string, { n: number; c: number }>();
  usage?.forEach((u) => { const x = by.get(u.feature) ?? { n: 0, c: 0 }; x.n++; x.c += u.credits; by.set(u.feature, x); });
  const links: Record<PlanId, string> = { professional: env.professionalLink, enterprise: env.enterpriseLink };
  const manage = can(ctx.role, "billing.view");
  const active = ent.status === "active";
  return (
    <>
      <PageHeader eyebrow="Plan & usage" title="Usage & billing" subtitle="AI actions are metered server-side. Paid access is activated only by a verified payment notification, never by visiting a payment page." />
      {!active && <div className="mb-6"><Notice tone="amber" title="No active subscription">AI features are locked until a subscription is active. Choose a plan below.</Notice></div>}
      {ent.allowanceConfigured && ent.balance <= 10 && <div className="mb-6"><Notice tone="red" title="Low credits">{ent.balance} credit(s) remaining. Upgrade or contact your administrator.</Notice></div>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Current plan" value={ent.plan === "none" ? "None" : PLANS[ent.plan].name} hint={sub?.status ?? "inactive"} />
        <Stat label="Credits remaining" value={ent.allowanceConfigured ? ent.balance : "Not capped"} hint={ent.allowanceConfigured ? "server-enforced" : "Allowance not configured: usage is metered only"} />
        <Stat label="AI actions, 30 days" value={usage?.length ?? 0} />
        <Stat label="Renews" value={sub?.current_period_end ? fmt(sub.current_period_end, false) : "—"} />
      </div>

      <h2 className="mb-4 mt-10 text-[22px] font-extrabold">Plans</h2>
      <div className="grid gap-6 md:grid-cols-2">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const p = PLANS[id];
          const current = ent.plan === id && active;
          return (
            <div key={id} className={`rounded-xl2 p-7 ${id === "enterprise" ? "bg-ink text-white" : "card"}`}>
              <div className="flex items-center justify-between"><h3 className="text-[20px] font-extrabold">{p.name}</h3>{current && <Badge tone="green">Current</Badge>}</div>
              <p className="mt-3"><span className="text-[40px] font-extrabold">${p.price}</span><span className="opacity-70">/month</span></p>
              <ul className="mt-4 space-y-2 text-[14px]">{p.features.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{f}</li>)}</ul>
              {manage ? (links[id]
                ? <a href={`/api/billing/checkout?plan=${id}`} className={`mt-6 w-full ${id === "enterprise" ? "btn-primary" : "btn-dark"}`}>{current ? "Manage / renew" : `Choose ${p.name}`}</a>
                : <button disabled className="btn-ghost mt-6 w-full">Payment link not configured</button>) : <p className="mt-6 text-[13px] opacity-70">Ask an Owner or Administrator to change plan.</p>}
            </div>);
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-400">Payments are handled on an external page. After payment, your subscription activates when the provider’s signed notification reaches FactoryPilot; this can take a short while.</p>

      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <Card title="Usage by feature (30 days)">
          {by.size ? <table className="w-full text-[14px]"><thead><tr><th className="th">Feature</th><th className="th">Actions</th><th className="th">Credits</th></tr></thead><tbody className="divide-y divide-canvas-line">{[...by].map(([f, v]) => <tr key={f}><td className="td !py-2">{FEATURE_LABEL[f as Feature] ?? f}</td><td className="td !py-2">{v.n}</td><td className="td !py-2">{v.c}</td></tr>)}</tbody></table> : <p className="text-ink-500">No AI usage yet.</p>}
          <p className="mt-4 text-[12px] text-ink-400">Metering weight per action: {Object.entries(FEATURE_COST).map(([k, v]) => `${FEATURE_LABEL[k as Feature]} ${v}`).join(" · ")}. Final plan allowances are set by your agreement.</p>
        </Card>
        <Card title="Recent AI activity">
          {runs?.length ? <ul className="divide-y divide-canvas-line text-[14px]">{runs.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.task}<span className="block text-[12px] text-ink-400">{r.agent.replace(/_/g, " ")} · {fmt(r.created_at)}</span></span><Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge></li>)}</ul> : <EmptyState title="No AI activity" body="Runs appear here with their status." />}
        </Card>
      </div>
      {manage && tx?.length ? <Card title="Credit transactions" className="mt-6"><ul className="divide-y divide-canvas-line text-[14px]">{tx.map((t, i) => <li key={i} className="flex justify-between py-2"><span>{t.reason} <span className="text-ink-400">{fmt(t.created_at)}</span></span><span className={t.delta < 0 ? "text-signal-red" : "text-signal-green"}>{t.delta > 0 ? "+" : ""}{t.delta}</span></li>)}</ul></Card> : null}
    </>
  );
}
