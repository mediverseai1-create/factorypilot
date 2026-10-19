import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { geminiConfigured } from "@/lib/env";
import { getEquipmentList, nameMap } from "@/lib/data";
import { computeStats, type DtEvent } from "@/lib/downtime";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Notice, PageHeader, Stat, fmt, mins } from "@/components/ui";
import { ColumnChart, HBarChart } from "@/components/charts";
import { createDowntime, runDowntimeAnalysis } from "../ops-actions";
import type { DowntimeAnalysis } from "@/lib/ai/schemas";

export const metadata = { title: "Downtime Intelligence" };

export default async function Downtime({ searchParams }: { searchParams: Promise<{ days?: string; equipment?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const ctx = await getCtx();
  const sb = await createClient();
  let q = sb.from("downtime_events").select("id,equipment_id,started_at,ended_at,duration_minutes,fault_code,shift_label,context,cause_category,source,notes").eq("org_id", ctx.orgId).gte("started_at", new Date(Date.now() - days * 864e5).toISOString()).order("started_at", { ascending: false }).limit(1000);
  if (sp.equipment) q = q.eq("equipment_id", sp.equipment);
  const [{ data }, equipment, { data: ins }] = await Promise.all([
    q, getEquipmentList(sb, ctx.orgId),
    sb.from("ai_insights").select("body,created_at").eq("org_id", ctx.orgId).eq("kind", "downtime_analysis").order("created_at", { ascending: false }).limit(1),
  ]);
  const events = (data ?? []) as (DtEvent & { source: string; notes: string | null })[];
  const stats = computeStats(events);
  const hourStats = computeStats(events.filter((e) => e.source !== "handover"));
  const eq = nameMap(equipment);
  const analysis = ins?.[0]?.body as DowntimeAnalysis | undefined;
  const hours = hourStats.byHour.map((v, h) => ({ name: String(h).padStart(2, "0"), value: v }));

  // maintenance response: median time from incident to resolution among resolved incidents in range
  const { data: resolved } = await sb.from("incidents").select("occurred_at,resolved_at").eq("org_id", ctx.orgId).eq("status", "resolved").not("resolved_at", "is", null).gte("occurred_at", new Date(Date.now() - days * 864e5).toISOString());
  const ttr = (resolved ?? []).map((r) => (new Date(r.resolved_at!).getTime() - new Date(r.occurred_at).getTime()) / 60000).sort((a, b) => a - b);
  const median = ttr.length ? ttr[Math.floor(ttr.length / 2)] : null;

  return (
    <>
      <PageHeader eyebrow="FactoryPilot Downtime" title="Downtime intelligence"
        subtitle="Counts, durations and groupings are computed directly from recorded events. AI adds a labelled interpretation on top; it never predicts failures or estimates savings." />
      <form className="mb-6 flex flex-wrap gap-3" role="search">
        <select name="days" defaultValue={String(days)} className="field !w-44" aria-label="Period">{[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>
        <select name="equipment" defaultValue={sp.equipment ?? ""} className="field !w-56" aria-label="Machine"><option value="">All machines</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <button className="btn-dark btn-sm">Apply</button>
      </form>

      {!events.length ? (
        <EmptyState title="No downtime recorded in this period" body="Downtime comes from submitted handovers, manual entries below, or CSV imports (Data & Integrations). No numbers are shown until real events exist." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Stoppages" value={stats.total} />
            <Stat label="Recorded downtime" value={mins(stats.withDuration ? stats.totalMinutes : null)} hint={`${stats.withDuration} of ${stats.total} events have a duration`} />
            <Stat label="Recurring fault groups" value={stats.recurring.length} tone={stats.recurring.length ? "amber" : undefined} hint="same machine + fault, 3+" />
            <Stat label="Median incident resolution" value={mins(median)} hint={ttr.length ? `${ttr.length} resolved incident(s)` : "No resolved incidents"} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Stoppages by machine"><HBarChart data={stats.byEquipment.slice(0, 8).map((x) => ({ name: eq.get(x.id) ?? "Unknown", value: x.count }))} unit="stoppages" /></Card>
            <Card title="Stoppages by shift">{stats.byShift.length ? <HBarChart color="#0B1B2B" data={stats.byShift.map((x) => ({ name: x.shift, value: x.count }))} unit="stoppages" /> : <p className="text-ink-500">No shift recorded on these events.</p>}</Card>
            <Card title="Stoppages by hour of day (UTC)">
              {hourStats.total ? <ColumnChart data={hours} unit="stoppages" /> : <p className="text-ink-500">Events created from handovers carry only a shift date, so they are excluded from time-of-day analysis.</p>}</Card>
            <Card title="Recurring faults">
              {stats.recurring.length ? <table className="w-full text-[14px]"><thead><tr><th className="th">Machine</th><th className="th">Fault</th><th className="th">Count</th></tr></thead>
                <tbody className="divide-y divide-canvas-line">{stats.recurring.slice(0, 8).map((r) => <tr key={r.eventIds[0]}><td className="td"><Link className="font-semibold underline" href={`/app/equipment/${r.equipmentId}`}>{eq.get(r.equipmentId)}</Link></td><td className="td font-mono">{r.faultCode ?? "no code"}</td><td className="td"><Badge tone="amber">{r.count}×</Badge></td></tr>)}</tbody></table>
                : <p className="text-ink-500">No machine has three or more events with the same fault code in this period.</p>}
              {stats.contextRepeats.length > 0 && <div className="mt-4 border-t border-canvas-line pt-4"><p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-400">Repeated operating context</p>
                <ul className="space-y-1.5 text-[14px]">{stats.contextRepeats.slice(0, 5).map((c) => <li key={c.eventIds[0]}><Badge tone="blue">{c.count}×</Badge> {eq.get(c.equipmentId)}: “{c.context}”</li>)}</ul></div>}
            </Card>
          </div>
        </>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card title="AI pattern analysis" action={analysis && ins?.[0] ? <span className="text-[12px] text-ink-400">{fmt(ins[0].created_at)}</span> : undefined}>
          {!geminiConfigured() && <Notice tone="amber" title="AI not configured">Set GEMINI_API_KEY to enable pattern analysis. All figures above work without it.</Notice>}
          {analysis ? (
            <div className="space-y-4 text-[15px]">
              <p>{analysis.summary}</p>
              {analysis.patterns.length > 0 && <div><p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-400">Patterns (interpretation, cites ≥2 events)</p><ul className="space-y-2">{analysis.patterns.map((p, i) => <li key={i}><Badge tone={p.strength === "strong" ? "amber" : "neutral"}>{p.strength}</Badge> {p.description}<span className="block text-[13px] text-ink-400">Basis: {p.basis}</span></li>)}</ul></div>}
              {analysis.inspection_flags.length > 0 && <div><p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-400">Worth an inspection</p><ul className="list-disc space-y-1 pl-5">{analysis.inspection_flags.map((f, i) => <li key={i}><span className="font-semibold">{f.equipment_ref}</span>: {f.reason}</li>)}</ul></div>}
              {analysis.data_limitations.length > 0 && <Notice tone="blue" title="Data limitations"><ul className="list-disc pl-5">{analysis.data_limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></Notice>}
            </div>
          ) : <p className="text-ink-500">No AI analysis yet. It needs at least two recorded events.</p>}
          {can(ctx.role, "ai.run") && (
            <ActionForm action={runDowntimeAnalysis} className="mt-5 flex flex-wrap items-end gap-3 border-t border-canvas-line pt-5">
              <input type="hidden" name="days" value={days} />
              <div><label className="label" htmlFor="a_eq">Scope</label><select id="a_eq" name="equipment_id" defaultValue={sp.equipment ?? ""} className="field !w-56"><option value="">All machines</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <SubmitButton pendingText="Analysing…" className="btn-primary">Run AI analysis</SubmitButton>
            </ActionForm>)}
        </Card>

        {can(ctx.role, "capture") && (
          <Card title="Record a stoppage">
            <ActionForm action={createDowntime} className="space-y-4">
              <div><label className="label" htmlFor="equipment_id">Machine</label><select id="equipment_id" name="equipment_id" required className="field"><option value="">Choose…</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label" htmlFor="started_at">Started</label><input id="started_at" name="started_at" type="datetime-local" required className="field" /></div>
                <div><label className="label" htmlFor="ended_at">Ended</label><input id="ended_at" name="ended_at" type="datetime-local" className="field" /></div>
                <div><label className="label" htmlFor="duration_minutes">Or minutes</label><input id="duration_minutes" name="duration_minutes" type="number" min={0} step="any" className="field" /></div>
                <div><label className="label" htmlFor="fault_code">Fault code</label><input id="fault_code" name="fault_code" className="field" /></div>
                <div><label className="label" htmlFor="shift_label">Shift</label><input id="shift_label" name="shift_label" className="field" /></div>
                <div><label className="label" htmlFor="cause_category">Cause category</label><input id="cause_category" name="cause_category" className="field" /></div>
              </div>
              <div><label className="label" htmlFor="context">Operating context</label><input id="context" name="context" className="field" placeholder="e.g. after material change" /></div>
              <div><label className="label" htmlFor="notes">Notes</label><textarea id="notes" name="notes" rows={2} className="field" /></div>
              <SubmitButton className="btn-dark w-full">Record</SubmitButton>
            </ActionForm>
          </Card>)}
      </div>
    </>
  );
}
