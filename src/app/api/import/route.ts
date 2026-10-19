import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCtx } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { IMPORT_KINDS, equipmentKey, summarise, validateRows, type ImportKind } from "@/lib/import/schema";

export const maxDuration = 60;
const MAX_ROWS = 5000;

const body = z.object({
  kind: z.enum(["equipment", "downtime_events", "maintenance_records", "incidents", "shift_notes"]),
  filename: z.string().max(200),
  mapping: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(MAX_ROWS),
});

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!can(ctx.role, "import")) return NextResponse.json({ error: "Your role cannot import data." }, { status: 403 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Invalid import request (max ${MAX_ROWS} rows).` }, { status: 400 });
  const { kind, filename, mapping, rows } = parsed.data as { kind: ImportKind; filename: string; mapping: Record<string, string>; rows: Record<string, string>[] };
  const sb = await createClient();

  const { data: eqs } = await sb.from("equipment").select("id,name,identifier").eq("org_id", ctx.orgId);
  const eqIndex = new Map<string, string>();
  eqs?.forEach((e) => { eqIndex.set(equipmentKey(e.name), e.id); eqIndex.set(equipmentKey(e.identifier), e.id); });
  const known = new Set(eqIndex.keys());

  // existing records -> canonical keys for duplicate detection against the database
  const existing = new Set<string>();
  if (kind === "equipment") eqs?.forEach((e) => existing.add(`equipment|${equipmentKey(e.identifier)}||`));
  const results = validateRows(kind, rows, mapping, { knownEquipment: known, existingKeys: kind === "equipment" ? existing : undefined });
  const canon = new Set<string>();
  if (kind !== "equipment") {
    const t = { downtime_events: ["downtime_events", "started_at"], maintenance_records: ["maintenance_records", "performed_at"], incidents: ["incidents", "occurred_at"], shift_notes: ["knowledge_records", "occurred_at"] }[kind];
    const { data } = await sb.from(t[0]).select(`equipment_id,${t[1]}`).eq("org_id", ctx.orgId).limit(20000) as unknown as { data: Record<string, string>[] | null };
    data?.forEach((r) => canon.add(`${r.equipment_id ?? ""}|${new Date(r[t[1]]).toISOString()}`));
  }

  const org_id = ctx.orgId;
  const { data: fac } = await sb.from("facilities").select("id").eq("org_id", org_id).limit(1);
  const { data: lines } = await sb.from("production_lines").select("id,name").eq("org_id", org_id);
  const lineByName = new Map((lines ?? []).map((l) => [equipmentKey(l.name), l.id]));

  type Pending = { idx: number; row: Record<string, unknown> };
  const toInsert: Pending[] = [];
  const outcome = results.map((r) => ({ ...r, status: r.ok ? ("imported" as const) : r.errors.some((e) => e.startsWith("Duplicate")) ? ("duplicate" as const) : ("rejected" as const), targetId: null as string | null }));

  for (let i = 0; i < results.length; i++) {
    const r = results[i]; if (!r.ok) continue;
    const v = r.value;
    const equipment_id = v.equipment ? eqIndex.get(equipmentKey(v.equipment)) ?? null : null;
    const ts = String(v.started_at ?? v.performed_at ?? v.occurred_at ?? "");
    if (kind !== "equipment") {
      const ck = `${equipment_id ?? ""}|${ts}`;
      if (canon.has(ck) && kind !== "shift_notes") { outcome[i].status = "duplicate"; outcome[i].errors.push("Duplicate record (already in FactoryPilot)"); outcome[i].ok = false; continue; }
      canon.add(ck);
    }
    if (kind === "equipment") {
      let line_id: string | null = null;
      if (v.line) {
        line_id = lineByName.get(equipmentKey(v.line)) ?? null;
        if (!line_id && fac?.[0]) {
          const { data: nl } = await sb.from("production_lines").insert({ org_id, facility_id: fac[0].id, name: String(v.line) }).select("id").single();
          if (nl) { line_id = nl.id; lineByName.set(equipmentKey(v.line), nl.id); }
        }
      }
      toInsert.push({ idx: i, row: { org_id, facility_id: fac?.[0]?.id ?? null, line_id, identifier: v.identifier, name: v.name, equipment_type: v.equipment_type ?? null, location: v.location ?? null, manufacturer: v.manufacturer ?? null, model: v.model ?? null } });
    } else if (kind === "downtime_events") {
      toInsert.push({ idx: i, row: { org_id, equipment_id, started_at: v.started_at, ended_at: v.ended_at ?? null, duration_minutes: v.duration_minutes ?? null, fault_code: v.fault_code ?? null, shift_label: v.shift_label ?? null, context: v.context ?? null, notes: v.notes ?? null, source: "import" } });
    } else if (kind === "maintenance_records") {
      toInsert.push({ idx: i, row: { org_id, equipment_id, performed_at: v.performed_at, description: v.description, action_type: v.action_type ?? null, parts_replaced: v.parts_replaced ?? null, performed_by: v.performed_by ?? null, outcome: v.outcome ?? "unknown", duration_minutes: v.duration_minutes ?? null, source: "import", created_by: ctx.userId } });
    } else if (kind === "incidents") {
      toInsert.push({ idx: i, row: { org_id, equipment_id, occurred_at: v.occurred_at, title: v.title, description: v.description ?? null, fault_code: v.fault_code ?? null, category: v.category ?? "fault", severity: v.severity ?? "medium", shift_label: v.shift_label ?? null, status: "resolved", reported_by: ctx.userId } });
    } else {
      toInsert.push({ idx: i, row: { org_id, equipment_id, title: String(v.body).slice(0, 80), body: v.body, kind: "note", verification: "operator_reported", shift_label: v.shift_label ?? null, occurred_at: v.occurred_at, source_table: "imported_files", created_by: ctx.userId } });
    }
  }

  const table = { equipment: "equipment", downtime_events: "downtime_events", maintenance_records: "maintenance_records", incidents: "incidents", shift_notes: "knowledge_records" }[kind];
  for (const c of chunk(toInsert, 200)) {
    const { data, error } = await sb.from(table).insert(c.map((p) => p.row)).select("id");
    if (error || !data) {
      for (const p of c) { outcome[p.idx].status = "rejected"; outcome[p.idx].ok = false; outcome[p.idx].errors.push(error?.message ?? "Insert failed"); }
      continue;
    }
    data.forEach((d, k) => { outcome[c[k].idx].targetId = d.id; });
    // searchable knowledge for imported history (keyword search immediately; semantic via "Index" later)
    if (kind === "maintenance_records" || kind === "incidents") {
      await sb.from("knowledge_records").insert(c.map((p, k) => ({
        org_id, equipment_id: p.row.equipment_id, kind: kind === "incidents" ? "incident" : "maintenance", verification: "operator_reported", created_by: ctx.userId,
        title: kind === "incidents" ? String(p.row.title) : `Maintenance: ${p.row.action_type ?? "intervention"}`,
        body: kind === "incidents" ? String(p.row.description ?? p.row.title) : `${p.row.description}. Parts: ${p.row.parts_replaced ?? "none recorded"}. Outcome: ${p.row.outcome}.`,
        source_table: table, source_id: data[k].id, fault_code: p.row.fault_code ?? null, occurred_at: (p.row.occurred_at ?? p.row.performed_at) as string,
      })));
    }
  }

  const sum = summarise(outcome);
  const imported = outcome.filter((o) => o.status === "imported" && o.targetId).length;
  const dupes = outcome.filter((o) => o.status === "duplicate").length;
  const rejected = outcome.filter((o) => o.status === "rejected").length;
  const { data: file } = await sb.from("imported_files").insert({
    org_id, kind, filename, total_rows: rows.length, imported_rows: imported, rejected_rows: rejected, duplicate_rows: dupes, mapping,
    summary: { ...sum, kindLabel: IMPORT_KINDS[kind].label }, created_by: ctx.userId,
  }).select("id").single();
  if (file) {
    const recs = outcome.filter((o) => o.status !== "imported" || o.targetId).map((o) => ({
      org_id, file_id: file.id, row_number: o.row, status: o.status, target_table: table, target_id: o.targetId, errors: o.errors.length ? o.errors : null,
      raw: o.status === "imported" ? null : rows[o.row - 2],
    }));
    for (const c of chunk(recs, 500)) await sb.from("imported_records").insert(c);
  }
  await sb.from("activity_logs").insert({ org_id, actor_id: ctx.userId, action: "import.completed", entity_table: "imported_files", entity_id: file?.id, detail: { kind, imported, rejected, duplicates: dupes } });

  return NextResponse.json({
    fileId: file?.id, imported, rejected, duplicates: dupes, summary: sum,
    rejectedRows: outcome.filter((o) => o.status !== "imported" || !o.targetId).slice(0, 100).map((o) => ({ row: o.row, status: o.status, errors: o.errors })),
  });
}
