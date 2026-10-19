import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getEquipmentList } from "@/lib/data";
import { CONNECTORS } from "@/lib/integrations";
import { ImportWizard } from "@/components/import-wizard";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Notice, PageHeader, fmt } from "@/components/ui";
import { addDocument, addIntegration } from "../admin-actions";

export const metadata = { title: "Data & Integrations" };

export default async function DataPage() {
  const ctx = await getCtx();
  const sb = await createClient();
  const [equipment, { data: files }, { data: planned }, { data: docs }] = await Promise.all([
    getEquipmentList(sb, ctx.orgId),
    sb.from("imported_files").select("id,kind,filename,imported_rows,rejected_rows,duplicate_rows,total_rows,created_at").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(15),
    sb.from("integrations").select("id,kind,name,status,created_at").eq("org_id", ctx.orgId),
    sb.from("operational_documents").select("id,title,doc_type,approved,equipment_id").eq("org_id", ctx.orgId).order("created_at", { ascending: false }).limit(20),
  ]);
  const importer = can(ctx.role, "import");
  return (
    <>
      <PageHeader eyebrow="Data ingestion" title="Data & integrations" subtitle="Bring in your existing equipment lists, downtime, maintenance and incident history. Upload → Inspect → Map → Validate → Preview → Import → Analyze." />
      {importer ? <ImportWizard equipment={equipment.map((e) => ({ name: e.name, identifier: e.identifier }))} /> : <Notice tone="amber">Your role can view imports but not run them.</Notice>}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Import history">
          {files?.length ? <ul className="divide-y divide-canvas-line text-[14px]">{files.map((f) => <li key={f.id} className="py-2.5"><p className="font-semibold">{f.filename} <Badge>{f.kind.replace("_", " ")}</Badge></p><p className="text-ink-500">{f.imported_rows} imported · {f.duplicate_rows} duplicate · {f.rejected_rows} rejected of {f.total_rows} · {fmt(f.created_at)}</p></li>)}</ul> : <p className="text-ink-500">No imports yet.</p>}
        </Card>
        <Card title="Integrations">
          <ul className="divide-y divide-canvas-line">{CONNECTORS.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 py-3"><div><p className="font-semibold">{c.label}</p><p className="text-[13px] text-ink-500">{c.description}</p></div>
              <Badge tone={c.status === "supported" ? "green" : "neutral"}>{c.status === "supported" ? "Supported" : "Planned: not available"}</Badge></li>))}</ul>
          <p className="mt-3 text-[12px] text-ink-400">No live machine or system connection exists unless a connector is listed as supported and configured. FactoryPilot never displays simulated telemetry.</p>
          {planned?.length ? <div className="mt-4 border-t border-canvas-line pt-4"><p className="mb-2 text-[12px] font-bold uppercase tracking-wider text-ink-400">Your requested integrations</p><ul className="space-y-1 text-[14px]">{planned.map((p) => <li key={p.id}>{p.name} <Badge>{p.kind}</Badge> <Badge tone="amber">{p.status}</Badge></li>)}</ul></div> : null}
          {can(ctx.role, "settings.manage") && (
            <ActionForm action={addIntegration} className="mt-4 flex flex-wrap gap-2 border-t border-canvas-line pt-4">
              <select name="kind" className="field !w-32" aria-label="Type">{["cmms", "mes", "erp", "scada", "historian", "other"].map((k) => <option key={k}>{k}</option>)}</select>
              <input name="name" required placeholder="System name (e.g. SAP PM)" className="field flex-1" aria-label="System name" />
              <SubmitButton className="btn-ghost btn-sm">Register interest</SubmitButton>
            </ActionForm>)}
        </Card>
      </div>

      <Card title="Manuals & procedures" className="mt-6">
        <p className="mb-4 text-[14px] text-ink-500">Paste the text of a manual section or approved procedure. It becomes searchable knowledge, linked to a machine. Manufacturer documentation is treated as operator-reported until a qualified person raises its verification level.</p>
        {importer && (
          <ActionForm action={addDocument} className="grid gap-3 md:grid-cols-2">
            <input name="title" required placeholder="Title" className="field" aria-label="Title" />
            <select name="doc_type" className="field" aria-label="Type"><option value="manual">Manual</option><option value="procedure">Procedure</option><option value="sop">SOP</option><option value="other">Other</option></select>
            <select name="equipment_id" className="field md:col-span-2" aria-label="Machine"><option value="">Applies to: all / unspecified</option>{equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
            <textarea name="text_content" rows={5} required placeholder="Paste text…" className="field md:col-span-2" aria-label="Text" />
            <div className="md:col-span-2"><SubmitButton className="btn-dark">Add document</SubmitButton></div>
          </ActionForm>)}
        {docs?.length ? <ul className="mt-5 space-y-1.5 text-[14px]">{docs.map((d) => <li key={d.id}>📄 {d.title} <Badge>{d.doc_type}</Badge></li>)}</ul> : null}
      </Card>
    </>
  );
}
