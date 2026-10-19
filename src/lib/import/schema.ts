/** CSV import definitions + validation, shared by the browser wizard (preview) and the server import route (authoritative). */
export type ImportKind = "equipment" | "downtime_events" | "maintenance_records" | "incidents" | "shift_notes";

export type FieldDef = { key: string; label: string; required?: boolean; type: "text" | "timestamp" | "number" | "enum"; options?: string[]; synonyms: string[] };

export const IMPORT_KINDS: Record<ImportKind, { label: string; description: string; fields: FieldDef[] }> = {
  equipment: {
    label: "Equipment list", description: "Machines, assets and their production lines.",
    fields: [
      { key: "identifier", label: "Equipment ID", required: true, type: "text", synonyms: ["id", "asset id", "asset tag", "tag", "equipment id", "machine id", "identifier", "asset number"] },
      { key: "name", label: "Name", required: true, type: "text", synonyms: ["name", "machine", "machine name", "equipment", "equipment name", "asset"] },
      { key: "equipment_type", label: "Type", type: "text", synonyms: ["type", "category", "equipment type", "class"] },
      { key: "line", label: "Production line", type: "text", synonyms: ["line", "production line", "area", "cell"] },
      { key: "location", label: "Location", type: "text", synonyms: ["location", "site", "department"] },
      { key: "manufacturer", label: "Manufacturer", type: "text", synonyms: ["manufacturer", "make", "vendor", "oem"] },
      { key: "model", label: "Model", type: "text", synonyms: ["model", "model number"] },
    ],
  },
  downtime_events: {
    label: "Downtime / stoppage events", description: "Machine stoppages with start time and duration.",
    fields: [
      { key: "equipment", label: "Equipment ID or name", required: true, type: "text", synonyms: ["equipment", "machine", "equipment id", "asset", "asset id", "machine id"] },
      { key: "started_at", label: "Start time", required: true, type: "timestamp", synonyms: ["start", "started", "start time", "timestamp", "date", "stopped at", "begin"] },
      { key: "ended_at", label: "End time", type: "timestamp", synonyms: ["end", "ended", "end time", "restart", "resumed at"] },
      { key: "duration_minutes", label: "Duration (min)", type: "number", synonyms: ["duration", "minutes", "duration min", "downtime minutes", "downtime"] },
      { key: "fault_code", label: "Fault code", type: "text", synonyms: ["fault", "fault code", "alarm", "alarm code", "code"] },
      { key: "shift_label", label: "Shift", type: "text", synonyms: ["shift", "shift name"] },
      { key: "context", label: "Operating context", type: "text", synonyms: ["context", "material", "product", "changeover", "operation"] },
      { key: "notes", label: "Notes", type: "text", synonyms: ["notes", "comment", "comments", "description", "reason"] },
    ],
  },
  maintenance_records: {
    label: "Maintenance history", description: "Past maintenance actions and outcomes.",
    fields: [
      { key: "equipment", label: "Equipment ID or name", required: true, type: "text", synonyms: ["equipment", "machine", "equipment id", "asset", "asset id"] },
      { key: "performed_at", label: "Date performed", required: true, type: "timestamp", synonyms: ["date", "performed", "performed at", "completed", "completed at", "timestamp"] },
      { key: "description", label: "Work description", required: true, type: "text", synonyms: ["description", "work", "work done", "action", "details", "notes", "work performed"] },
      { key: "action_type", label: "Action type", type: "text", synonyms: ["type", "action type", "maintenance type", "category"] },
      { key: "parts_replaced", label: "Parts replaced", type: "text", synonyms: ["parts", "parts replaced", "spares"] },
      { key: "performed_by", label: "Technician", type: "text", synonyms: ["technician", "performed by", "by", "engineer"] },
      { key: "outcome", label: "Outcome", type: "enum", options: ["resolved", "partial", "not_resolved", "unknown"], synonyms: ["outcome", "result", "status"] },
      { key: "duration_minutes", label: "Duration (min)", type: "number", synonyms: ["duration", "minutes", "time spent"] },
    ],
  },
  incidents: {
    label: "Fault / incident records", description: "Faults, alarms and incidents with severity.",
    fields: [
      { key: "equipment", label: "Equipment ID or name", type: "text", synonyms: ["equipment", "machine", "equipment id", "asset", "asset id"] },
      { key: "occurred_at", label: "Occurred at", required: true, type: "timestamp", synonyms: ["date", "occurred", "occurred at", "timestamp", "time", "reported at"] },
      { key: "title", label: "Title", required: true, type: "text", synonyms: ["title", "summary", "fault", "issue", "problem"] },
      { key: "description", label: "Description", type: "text", synonyms: ["description", "details", "notes", "comment"] },
      { key: "fault_code", label: "Fault code", type: "text", synonyms: ["fault code", "alarm", "alarm code", "code"] },
      { key: "category", label: "Category", type: "enum", options: ["fault", "safety", "quality", "material", "process", "other"], synonyms: ["category", "type"] },
      { key: "severity", label: "Severity", type: "enum", options: ["low", "medium", "high", "critical"], synonyms: ["severity", "priority", "level"] },
      { key: "shift_label", label: "Shift", type: "text", synonyms: ["shift"] },
    ],
  },
  shift_notes: {
    label: "Historical shift notes", description: "Past notes and handover text, indexed as operator-reported knowledge.",
    fields: [
      { key: "occurred_at", label: "Date", required: true, type: "timestamp", synonyms: ["date", "timestamp", "time", "noted at"] },
      { key: "body", label: "Note text", required: true, type: "text", synonyms: ["note", "notes", "text", "body", "comment", "handover", "description"] },
      { key: "equipment", label: "Equipment ID or name", type: "text", synonyms: ["equipment", "machine", "asset"] },
      { key: "shift_label", label: "Shift", type: "text", synonyms: ["shift"] },
    ],
  },
};

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Suggest a column for each field from header names. */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of IMPORT_KINDS[kind].fields) {
    const hit = headers.find((h) => !used.has(h) && (clean(h) === clean(f.key) || f.synonyms.includes(clean(h))));
    if (hit) { map[f.key] = hit; used.add(hit); }
  }
  return map;
}

export function parseTimestamp(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  // Zone-less values are read as UTC so imports do not depend on the server's timezone; day-first for dd/mm/yyyy.
  let t = NaN;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) t = Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] ?? 0), +(dmy[5] ?? 0));
  else if (ymd) t = Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3], +(ymd[4] ?? 0), +(ymd[5] ?? 0), +(ymd[6] ?? 0));
  else t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const y = new Date(t).getUTCFullYear();
  return y < 1990 || y > new Date().getUTCFullYear() + 1 ? null : new Date(t).toISOString();
}

export type RowResult = { row: number; ok: boolean; errors: string[]; warnings: string[]; value: Record<string, unknown>; dupKey: string };

export type ValidateOpts = { knownEquipment: Set<string>; existingKeys?: Set<string> };

const eqKey = (s: unknown) => clean(String(s ?? ""));

export function validateRows(kind: ImportKind, rows: Record<string, string>[], mapping: Record<string, string>, opts: ValidateOpts): RowResult[] {
  const defs = IMPORT_KINDS[kind].fields;
  const seen = new Set(opts.existingKeys ?? []);
  return rows.map((raw, i) => {
    const errors: string[] = [], warnings: string[] = [];
    const value: Record<string, unknown> = {};
    for (const f of defs) {
      const col = mapping[f.key];
      const cell = col ? (raw[col] ?? "").toString().trim() : "";
      if (!cell) { if (f.required) errors.push(`Missing ${f.label}`); continue; }
      if (f.type === "timestamp") {
        const ts = parseTimestamp(cell);
        if (!ts) errors.push(`Invalid timestamp in ${f.label}: "${cell}"`); else value[f.key] = ts;
      } else if (f.type === "number") {
        const n = Number(cell.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) errors.push(`${f.label} is not a valid number: "${cell}"`); else value[f.key] = n;
      } else if (f.type === "enum") {
        const o = f.options!.find((x) => clean(x) === clean(cell));
        if (o) value[f.key] = o; else { warnings.push(`${f.label} "${cell}" not recognised; stored as default`); }
      } else value[f.key] = cell;
    }
    if (value.started_at && value.ended_at && String(value.ended_at) < String(value.started_at)) errors.push("End time is before start time");
    if (kind === "downtime_events" && value.duration_minutes == null && !value.ended_at) warnings.push("No duration or end time: excluded from downtime totals");
    if ("equipment" in value && !opts.knownEquipment.has(eqKey(value.equipment))) {
      if (kind === "incidents" || kind === "shift_notes") warnings.push(`Unrecognised equipment "${value.equipment}": imported without a machine link`);
      else errors.push(`Unrecognised equipment "${value.equipment}"`);
    }
    const dupKey = [kind, eqKey(value.identifier ?? value.equipment), value.started_at ?? value.performed_at ?? value.occurred_at ?? "", clean(String(value.title ?? value.description ?? value.body ?? "")).slice(0, 80)].join("|");
    if (!errors.length) {
      if (seen.has(dupKey)) errors.push("Duplicate record");
      else seen.add(dupKey);
    }
    return { row: i + 2, ok: errors.length === 0, errors, warnings, value, dupKey };
  });
}

export type ImportSummary = {
  total: number; valid: number; rejected: number; duplicates: number;
  missingFields: number; invalidTimestamps: number; unrecognisedEquipment: number; withWarnings: number;
};
export function summarise(results: RowResult[]): ImportSummary {
  const has = (r: RowResult, s: string) => r.errors.some((e) => e.startsWith(s));
  return {
    total: results.length, valid: results.filter((r) => r.ok).length, rejected: results.filter((r) => !r.ok).length,
    duplicates: results.filter((r) => has(r, "Duplicate")).length, missingFields: results.filter((r) => has(r, "Missing")).length,
    invalidTimestamps: results.filter((r) => r.errors.some((e) => e.startsWith("Invalid timestamp"))).length,
    unrecognisedEquipment: results.filter((r) => r.errors.concat(r.warnings).some((e) => e.startsWith("Unrecognised equipment"))).length,
    withWarnings: results.filter((r) => r.warnings.length).length,
  };
}
export const equipmentKey = eqKey;
