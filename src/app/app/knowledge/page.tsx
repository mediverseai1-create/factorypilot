import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { geminiConfigured } from "@/lib/env";
import { getEquipmentList, nameMap } from "@/lib/data";
import { KnowledgeSearch } from "@/components/knowledge-search";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, PageHeader, VerificationBadge, fmt } from "@/components/ui";
import { createKnowledge, reindexKnowledge, setVerification } from "../ops-actions";

export const metadata = { title: "Knowledge Base" };

type SP = { equipment?: string; kind?: string; verification?: string; fault?: string; from?: string; to?: string; shift?: string; q?: string };

export default async function Knowledge({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const sb = await createClient();
  let q = sb.from("knowledge_records").select("id,title,body,kind,verification,equipment_id,fault_code,shift_label,occurred_at,source_table,source_id,embedding").eq("org_id", ctx.orgId).order("occurred_at", { ascending: false }).limit(60);
  if (sp.equipment) q = q.eq("equipment_id", sp.equipment);
  if (sp.kind) q = q.eq("kind", sp.kind);
  if (sp.verification) q = q.eq("verification", sp.verification);
  if (sp.fault) q = q.ilike("fault_code", `%${sp.fault.replace(/[%,]/g, "")}%`);
  if (sp.shift) q = q.ilike("shift_label", `%${sp.shift.replace(/[%,]/g, "")}%`);
  if (sp.from) q = q.gte("occurred_at", sp.from);
  if (sp.to) q = q.lte("occurred_at", `${sp.to}T23:59:59Z`);
  if (sp.q) q = q.textSearch("fts", sp.q, { type: "websearch", config: "english" });
  const [{ data }, equipment, { count: total }, { count: unindexed }] = await Promise.all([
    q, getEquipmentList(sb, ctx.orgId),
    sb.from("knowledge_records").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId),
    sb.from("knowledge_records").select("id", { count: "exact", head: true }).eq("org_id", ctx.orgId).is("embedding", null),
  ]);
  const eq = nameMap(equipment);
  const canVerify = can(ctx.role, "knowledge.confirm");
  const srcLink = (t: string | null, id: string | null) => (t === "handovers" && id ? `/app/handovers/${id}` : t === "investigations" && id ? `/app/investigations/${id}` : t === "incidents" ? "/app/incidents" : null);

  return (
    <>
      <PageHeader eyebrow="Industrial knowledge" title="Knowledge base"
        subtitle={`${total ?? 0} organisation-private records. Every record shows where it came from and how far it has been verified. AI suggestions are never promoted to official knowledge automatically.`} />
      <KnowledgeSearch equipment={equipment.map((e) => ({ id: e.id, name: e.name }))} aiReady={geminiConfigured()} />

      <h2 className="mb-3 mt-10 text-[20px] font-extrabold">Browse records</h2>
      <form className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Keywords" className="field" aria-label="Keywords" />
        <select name="equipment" defaultValue={sp.equipment ?? ""} className="field" aria-label="Equipment"><option value="">All equipment</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <select name="kind" defaultValue={sp.kind ?? ""} className="field" aria-label="Record type"><option value="">All types</option>{["handover_entry", "incident", "maintenance", "resolution", "procedure", "lesson", "manual", "note"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select>
        <select name="verification" defaultValue={sp.verification ?? ""} className="field" aria-label="Verification"><option value="">Any verification</option>{["operator_reported", "ai_interpretation", "suggested_troubleshooting", "technician_confirmed", "supervisor_approved", "verified_resolution"].map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}</select>
        <input name="fault" defaultValue={sp.fault} placeholder="Fault code" className="field" aria-label="Fault code" />
        <input name="shift" defaultValue={sp.shift} placeholder="Shift" className="field" aria-label="Shift" />
        <input name="from" type="date" defaultValue={sp.from} className="field" aria-label="From date" />
        <input name="to" type="date" defaultValue={sp.to} className="field" aria-label="To date" />
        <button className="btn-dark btn-sm sm:col-span-2 lg:col-span-1">Apply filters</button>
        <Link href="/app/knowledge" className="btn-ghost btn-sm">Clear</Link>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          {data?.length ? (
            <ul className="space-y-3">{data.map((k) => (
              <li key={k.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-2"><p className="text-[16px] font-bold">{k.title}</p><VerificationBadge level={k.verification} /><Badge>{k.kind.replace("_", " ")}</Badge></div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-500">{k.body.slice(0, 500)}</p>
                <p className="mt-2 text-[12px] text-ink-400">{fmt(k.occurred_at, false)}{k.equipment_id && <> · <Link href={`/app/equipment/${k.equipment_id}`} className="font-semibold underline">{eq.get(k.equipment_id)}</Link></>}{k.fault_code && <> · fault <span className="font-mono">{k.fault_code}</span></>}{k.shift_label && <> · {k.shift_label}</>}{srcLink(k.source_table, k.source_id) && <> · <Link className="font-semibold underline" href={srcLink(k.source_table, k.source_id)!}>source record</Link></>}{!k.embedding && " · keyword-only"}</p>
                {canVerify && k.verification !== "verified_resolution" && (
                  <form action={setVerification.bind(null, k.id)} className="mt-3 flex gap-2">
                    <select name="verification" defaultValue={k.verification} aria-label="Verification level" className="field !w-56 !py-1.5 text-sm">
                      {["operator_reported", "technician_confirmed", ...(can(ctx.role, "knowledge.approve") ? ["supervisor_approved"] : [])].map((v) => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
                    </select><button className="btn-ghost btn-sm">Set</button>
                  </form>)}
              </li>))}</ul>
          ) : <EmptyState title="No knowledge records match" body="Records are created from submitted handovers, incidents, maintenance, closed investigations and CSV imports. Add a lesson or procedure with the form." />}
        </div>
        <div className="space-y-6">
          {can(ctx.role, "capture") && (
            <Card title="Add a lesson or procedure">
              <ActionForm action={createKnowledge} className="space-y-3">
                <input name="title" required placeholder="Title" className="field" aria-label="Title" />
                <textarea name="body" required rows={4} placeholder="What should the next person know?" className="field" aria-label="Body" />
                <div className="grid grid-cols-2 gap-3"><select name="kind" className="field" aria-label="Type">{["lesson", "procedure", "note"].map((k) => <option key={k}>{k}</option>)}</select><input name="fault_code" placeholder="Fault code" className="field" /></div>
                <select name="equipment_id" className="field" aria-label="Machine"><option value="">Machine (optional)</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                <p className="text-[12px] text-ink-400">Saved as operator-reported. A qualified reviewer can raise its verification level.</p>
                <SubmitButton className="btn-dark w-full">Add</SubmitButton>
              </ActionForm>
            </Card>)}
          {can(ctx.role, "import") && (unindexed ?? 0) > 0 && (
            <Card title="Semantic index">
              <p className="mb-3 text-[14px] text-ink-500">{unindexed} record(s) have no embedding and are found by keyword only.</p>
              <ActionForm action={reindexKnowledge}><SubmitButton pendingText="Indexing…" className="btn-ghost w-full">Index up to 60 records</SubmitButton></ActionForm>
            </Card>)}
        </div>
      </div>
    </>
  );
}
