import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Badge, EmptyState, LinkButton, PageHeader, fmt } from "@/components/ui";

export const metadata = { title: "Shift Handovers" };

export default async function Handovers() {
  const ctx = await getCtx();
  const sb = await createClient();
  const { data } = await sb.from("handovers").select("id,shift_label,shift_date,status,submitted_at,author_id,report,created_at, production_lines(name), facilities(name)").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(60);
  const ids = [...new Set((data ?? []).map((h) => h.author_id))];
  const { data: ppl } = ids.length ? await sb.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const name = (id: string) => ppl?.find((p) => p.id === id)?.full_name ?? "Unknown";
  const tone = { draft: "neutral", submitted: "amber", acknowledged: "green" } as const;
  return (
    <>
      <PageHeader
        eyebrow="FactoryPilot Shift" title="Shift Handovers"
        subtitle="Outgoing operators capture notes, review the AI-structured report and submit. Incoming shifts read, acknowledge and act."
        actions={can(ctx.role, "capture") ? <LinkButton href="/app/handovers/new">New handover</LinkButton> : null}
      />
      {!data?.length ? (
        <EmptyState title="No handovers yet" body="Start your first handover: type or record what happened this shift. FactoryPilot structures it, links it to your equipment and carries open issues forward." action={can(ctx.role, "capture") ? <LinkButton href="/app/handovers/new">Start a handover</LinkButton> : undefined} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-canvas-line"><tr><th className="th">Shift</th><th className="th">Line</th><th className="th">Author</th><th className="th">Status</th><th className="th">Summary</th><th className="th">Submitted</th></tr></thead>
            <tbody className="divide-y divide-canvas-line">
              {data.map((h) => (
                <tr key={h.id} className="hover:bg-canvas-soft">
                  <td className="td"><Link className="font-bold underline decoration-amber decoration-2 underline-offset-2" href={`/app/handovers/${h.id}`}>{h.shift_label ?? "Shift"} · {h.shift_date}</Link></td>
                  <td className="td">{(h.production_lines as unknown as { name: string } | null)?.name ?? "—"}</td>
                  <td className="td">{name(h.author_id)}</td>
                  <td className="td"><Badge tone={tone[h.status as keyof typeof tone]}>{h.status}</Badge></td>
                  <td className="td max-w-md text-ink-500">{(h.report as { summary?: string } | null)?.summary?.slice(0, 120) ?? "No report yet"}</td>
                  <td className="td whitespace-nowrap">{fmt(h.submitted_at)}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
