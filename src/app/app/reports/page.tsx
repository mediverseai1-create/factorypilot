import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getPeople } from "@/lib/data";
import { REPORT_KINDS, type ReportContent } from "@/lib/reports";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PrintButton } from "@/components/print-button";
import { Card, EmptyState, Notice, PageHeader, fmt } from "@/components/ui";
import { runImprovement } from "../ops-actions";
import { generateStoredReport } from "./actions";
import type { Briefing } from "@/lib/ai/schemas";

export const metadata = { title: "Reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ id?: string; tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  const [{ data: list }, { data: logs }, people, { data: imp }] = await Promise.all([
    sb.from("reports").select("id,kind,created_at,period_start,period_end").eq("org_id", ctx.orgId).neq("kind", "shift_briefing").order("created_at", { ascending: false }).limit(25),
    sb.from("activity_logs").select("id,actor_id,action,entity_table,created_at,detail").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(80),
    getPeople(sb, ctx.orgId),
    sb.from("ai_insights").select("body,created_at").eq("org_id", ctx.orgId).eq("kind", "improvement_review").order("created_at", { ascending: false }).limit(1),
  ]);
  const sel = sp.id ? (await sb.from("reports").select("*").eq("id", sp.id).eq("org_id", ctx.orgId).maybeSingle()).data : null;
  const c = sel?.content as ReportContent | undefined;
  const who = (u: string | null) => people.find((p) => p.id === u)?.name ?? "System";
  const improvement = imp?.[0]?.body as Briefing | undefined;
  return (
    <>
      <PageHeader eyebrow="Reports & audit" title="Reports" subtitle="Generated only from stored records, with the period, record count and limitations stated on every report." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {c ? (
            <Card title={c.title} action={<PrintButton />}>
              <p className="text-[13px] text-ink-400">Period {fmt(c.period.start, false)} to {fmt(c.period.end, false)} · generated {fmt(c.generated_at)} · {c.record_count} record(s)</p>
              <div className="mt-5 space-y-8">{c.sections.map((s) => (
                <section key={s.heading}>
                  <h3 className="mb-2 text-[15px] font-bold">{s.heading}</h3>
                  {s.bullets && <ul className="list-disc pl-5 text-[14px]">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
                  {s.columns && (s.rows?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[13px]"><thead><tr>{s.columns.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-canvas-line">{s.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} className="td !py-2">{v}</td>)}</tr>)}</tbody></table></div> : <p className="text-[14px] text-ink-400">No records in this period.</p>)}
                </section>))}</div>
              <div className="mt-8"><Notice tone="blue" title="Limitations"><ul className="list-disc pl-5">{c.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></Notice></div>
            </Card>
          ) : <EmptyState title="Generate a report" body="Choose a report type and period. Reports are saved so they can be reopened and audited." />}

          {improvement && (
            <Card title={`Continuous improvement review · ${fmt(imp![0].created_at, false)}`}>
              <p className="text-[16px] font-semibold">{improvement.headline}</p>
              {improvement.recurring.length > 0 && <ul className="mt-3 list-disc pl-5 text-[14px]">{improvement.recurring.map((r, i) => <li key={i}>{r.text}</li>)}</ul>}
              {improvement.watch_for.length > 0 && <><p className="mb-1 mt-4 text-[12px] font-bold uppercase tracking-wider text-ink-400">Opportunities</p><ul className="list-disc pl-5 text-[14px]">{improvement.watch_for.map((r, i) => <li key={i}>{r}</li>)}</ul></>}
            </Card>)}

          <Card title="Audit trail">
            {logs?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[13px]"><thead><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Record</th></tr></thead>
              <tbody className="divide-y divide-canvas-line">{logs.map((l) => <tr key={l.id}><td className="td !py-2 whitespace-nowrap">{fmt(l.created_at)}</td><td className="td !py-2">{who(l.actor_id)}</td><td className="td !py-2 font-mono">{l.action}</td><td className="td !py-2 text-ink-400">{l.entity_table ?? ""}</td></tr>)}</tbody></table></div> : <p className="text-ink-500">No activity yet.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="New report">
            <ActionForm action={generateStoredReport} className="space-y-3">
              <select name="kind" className="field" aria-label="Report type">{Object.entries(REPORT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <select name="days" defaultValue="7" className="field" aria-label="Period">{[[1, "Last 24 hours"], [7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last 12 months"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <SubmitButton className="btn-dark w-full">Generate</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Saved reports">
            {list?.length ? <ul className="space-y-2 text-[14px]">{list.map((r) => <li key={r.id}><Link className="font-semibold underline" href={`/app/reports?id=${r.id}`}>{REPORT_KINDS[r.kind as keyof typeof REPORT_KINDS] ?? r.kind}</Link><span className="block text-[12px] text-ink-400">{fmt(r.created_at)}</span></li>)}</ul> : <p className="text-ink-500">None yet.</p>}
          </Card>
          {can(ctx.role, "ai.run") && (
            <Card title="Continuous improvement (AI)">
              <p className="mb-3 text-[13px] text-ink-500">Reviews confirmed resolutions and recurrence outcomes. Enterprise plan.</p>
              <ActionForm action={runImprovement}><SubmitButton pendingText="Reviewing…" className="btn-ghost w-full">Run improvement review</SubmitButton></ActionForm>
            </Card>)}
        </div>
      </div>
    </>
  );
}
