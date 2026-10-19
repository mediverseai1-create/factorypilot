import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { geminiConfigured } from "@/lib/env";
import { AGENTS, routeIntent, type AgentId } from "@/lib/ai/orchestrator";
import { Badge, Card, Notice, PageHeader, fmt } from "@/components/ui";

export const metadata = { title: "AI Agents" };

const WORKSPACE: Record<AgentId, [string, string]> = {
  shift_handover: ["/app/handovers", "Shift Handovers"], industrial_knowledge: ["/app/knowledge", "Knowledge Base"],
  downtime_intelligence: ["/app/downtime", "Downtime Intelligence"], maintenance_intelligence: ["/app/maintenance", "Maintenance & Work Orders"],
  incident_investigation: ["/app/investigations", "Investigations"], shift_continuity: ["/app/briefings", "Shift Briefings"],
  operations_briefing: ["/app", "Overview"], continuous_improvement: ["/app/reports", "Reports"],
};
const PIPELINE: [string, AgentId[]][] = [
  ["Capture", ["shift_handover"]], ["Understand", ["shift_handover"]], ["Connect", ["industrial_knowledge", "downtime_intelligence"]],
  ["Reason", ["incident_investigation"]], ["Handover", ["shift_handover", "shift_continuity"]], ["Investigate", ["incident_investigation"]],
  ["Act", ["maintenance_intelligence"]], ["Verify", ["continuous_improvement"]], ["Learn", ["industrial_knowledge", "continuous_improvement"]],
];

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  const { data: runs } = await sb.from("ai_agent_runs").select("id,agent,task,status,created_at,error,model").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(200);
  const stat = (a: string) => { const r = runs?.filter((x) => x.agent === a) ?? []; return { n: r.length, ok: r.filter((x) => x.status === "succeeded").length, last: r[0]?.created_at }; };
  const routed = ask ? routeIntent(ask) : null;
  return (
    <>
      <PageHeader eyebrow="Orchestration" title="AI agents" subtitle="Eight specialised agents share one authorised context and are activated by the task, not by separate chat windows. Every run is recorded, metered and attributable." />
      {!geminiConfigured() && <div className="mb-6"><Notice tone="amber" title="Gemini is not configured">No agent can run until GEMINI_API_KEY is set on the server. Deterministic features (counts, lists, imports, reports) work without it.</Notice></div>}

      <Card title="Route a request" className="mb-6">
        <form className="flex flex-wrap gap-3" role="search"><input name="ask" defaultValue={ask} className="field flex-1" placeholder="e.g. Has Press 3 had similar stoppages?" aria-label="Request" /><button className="btn-dark">Find the right agent</button></form>
        {routed && <p className="mt-4 text-[15px]">Handled by the <b>{AGENTS[routed].name}</b>. Open <Link className="font-semibold underline" href={routed === "industrial_knowledge" ? "/app/knowledge" : WORKSPACE[routed][0]}>{WORKSPACE[routed][1]}</Link> to run it with your records.</p>}
      </Card>

      <Card title="Capture → Understand → Connect → Reason → Handover → Investigate → Act → Verify → Learn" className="mb-6">
        <ol className="grid gap-3 md:grid-cols-3">{PIPELINE.map(([s, ags], i) => (
          <li key={s} className="rounded-xl bg-canvas-soft p-4"><p className="text-[12px] font-bold text-amber-700">{i + 1}. {s}</p><p className="mt-1 text-[14px] font-medium">{ags.map((a) => AGENTS[a].name.replace(" Agent", "")).join(" + ")}</p></li>))}</ol>
        <p className="mt-4 text-[13px] text-ink-500">Agents only receive records fetched through your signed-in session, so Row Level Security limits what any agent can see to what you can see. Outputs are validated against schemas; cited record IDs are checked against what was supplied; unsafe recommendations are screened.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(AGENTS) as AgentId[]).map((a) => {
          const s = stat(a);
          return (
            <div key={a} className="card p-5">
              <div className="flex items-start justify-between gap-3"><h3 className="text-[17px] font-bold">{AGENTS[a].name}</h3><Link className="text-[13px] font-semibold underline" href={WORKSPACE[a][0]}>Open</Link></div>
              <p className="mt-1 text-[14px] text-ink-500">{AGENTS[a].role}</p>
              <p className="mt-3 text-[13px] text-ink-400">{s.n} run(s) · {s.ok} succeeded{s.last && ` · last ${fmt(s.last)}`}</p>
            </div>);
        })}
      </div>

      <Card title="Run log" className="mt-6">
        {runs?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-[13px]"><thead><tr><th className="th">When</th><th className="th">Agent</th><th className="th">Task</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-canvas-line">{runs.slice(0, 25).map((r) => <tr key={r.id}><td className="td !py-2 whitespace-nowrap">{fmt(r.created_at)}</td><td className="td !py-2">{AGENTS[r.agent as AgentId]?.name ?? r.agent}</td><td className="td !py-2">{r.task}{r.error && <span className="block text-signal-red">{r.error}</span>}</td><td className="td !py-2"><Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</Badge></td></tr>)}</tbody></table></div> : <p className="text-ink-500">No agent runs yet.</p>}
      </Card>
    </>
  );
}
