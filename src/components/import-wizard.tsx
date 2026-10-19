"use client";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { IMPORT_KINDS, autoMap, equipmentKey, summarise, validateRows, type ImportKind } from "@/lib/import/schema";

const STEPS = ["Upload", "Inspect", "Map", "Validate", "Preview", "Import", "Analyze"] as const;
type Result = { imported: number; rejected: number; duplicates: number; rejectedRows: { row: number; status: string; errors: string[] }[]; fileId?: string };

export function ImportWizard({ equipment }: { equipment: { name: string; identifier: string }[] }) {
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ImportKind>("downtime_events");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const known = useMemo(() => new Set(equipment.flatMap((e) => [equipmentKey(e.name), equipmentKey(e.identifier)])), [equipment]);
  const def = IMPORT_KINDS[kind];
  const validation = useMemo(() => (step >= 3 ? validateRows(kind, rows, mapping, { knownEquipment: known }) : []), [step, kind, rows, mapping, known]);
  const sum = useMemo(() => summarise(validation), [validation]);
  const missingRequired = def.fields.filter((f) => f.required && !mapping[f.key]);

  function parse(f: File) {
    setError(""); setFile(f);
    if (f.size > 15 * 1024 * 1024) return setError("File is larger than 15 MB. Split it and import in parts.");
    Papa.parse<Record<string, string>>(f, {
      header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim(),
      complete: (r) => {
        if (!r.meta.fields?.length || !r.data.length) return setError("No rows found. Check that the first row contains column headers.");
        if (r.data.length > 5000) return setError(`This file has ${r.data.length} rows. The limit is 5,000 per import; split the file.`);
        setHeaders(r.meta.fields); setRows(r.data); setMapping(autoMap(kind, r.meta.fields)); setStep(1);
      },
      error: (e) => setError(e.message),
    });
  }

  async function run() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, filename: file?.name ?? "upload.csv", mapping, rows }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Import failed");
      setResult(j); setStep(6);
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed"); } finally { setBusy(false); }
  }
  function reset() { setStep(0); setFile(null); setRows([]); setHeaders([]); setMapping({}); setResult(null); setError(""); }

  return (
    <div className="card p-6">
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Import progress">
        {STEPS.map((s, i) => (<li key={s} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3.5 py-1 text-[13px] font-bold ${i === step ? "bg-ink text-white" : i < step ? "bg-amber-50 text-amber-700" : "bg-canvas-soft text-ink-400"}`}>{i + 1}. {s}</li>))}
      </ol>
      {error && <p role="alert" className="mb-4 rounded-lg bg-signal-redbg px-3 py-2 text-[14px] font-medium text-signal-red">{error}</p>}

      {step === 0 && (
        <div className="space-y-5">
          <div><label className="label" htmlFor="kind">What are you importing?</label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as ImportKind)} className="field max-w-md">{Object.entries(IMPORT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <p className="mt-1 text-[13px] text-ink-400">{def.description}</p></div>
          {kind !== "equipment" && kind !== "shift_notes" && !equipment.length && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[14px] text-amber-700">No equipment is registered yet. Import your equipment list first so rows can be linked to machines.</p>}
          <div><label className="label" htmlFor="csv">CSV file (comma, semicolon or tab separated; max 5,000 rows)</label>
            <input id="csv" type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} className="block w-full text-[14px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-5 file:py-2.5 file:font-semibold file:text-white" /></div>
          <p className="text-[12px] text-ink-400">Timestamps without a time zone are read as UTC. Day-first dates (31/01/2026) are supported.</p>
        </div>)}

      {step === 1 && (
        <div className="space-y-4">
          <p className="text-[15px]"><b>{file?.name}</b>: {rows.length} data row(s), {headers.length} column(s).</p>
          <div className="overflow-x-auto rounded-lg border border-canvas-line"><table className="w-full text-[13px]"><thead className="bg-canvas-soft"><tr>{headers.map((h) => <th key={h} className="th whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-canvas-line">{rows.slice(0, 5).map((r, i) => <tr key={i}>{headers.map((h) => <td key={h} className="td !py-2 whitespace-nowrap">{r[h]}</td>)}</tr>)}</tbody></table></div>
          <div className="flex gap-3"><button className="btn-dark btn-sm" onClick={() => setStep(2)}>Continue to mapping</button><button className="btn-ghost btn-sm" onClick={reset}>Choose another file</button></div>
        </div>)}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-500">Match each FactoryPilot field to a column. Required fields are marked *.</p>
          <div className="grid gap-4 md:grid-cols-2">{def.fields.map((f) => (
            <div key={f.key}><label className="label" htmlFor={`m_${f.key}`}>{f.label}{f.required && " *"}</label>
              <select id={`m_${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[f.key] = e.target.value; else delete n[f.key]; return n; })} className="field"><option value="">(not mapped)</option>{headers.map((h) => <option key={h}>{h}</option>)}</select></div>))}</div>
          {missingRequired.length > 0 && <p className="text-[13px] text-signal-red">Required: {missingRequired.map((f) => f.label).join(", ")}</p>}
          <div className="flex gap-3"><button className="btn-dark btn-sm" disabled={missingRequired.length > 0} onClick={() => setStep(3)}>Validate</button><button className="btn-ghost btn-sm" onClick={() => setStep(1)}>Back</button></div>
        </div>)}

      {step === 3 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Rows", sum.total], ["Valid", sum.valid], ["Rejected", sum.rejected], ["Duplicates in file", sum.duplicates], ["Missing fields", sum.missingFields], ["Invalid timestamps", sum.invalidTimestamps], ["Unrecognised equipment", sum.unrecognisedEquipment], ["With warnings", sum.withWarnings]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-canvas-soft p-4"><p className="text-[12px] font-semibold text-ink-400">{k}</p><p className={`text-[26px] font-extrabold ${k === "Rejected" && Number(v) > 0 ? "text-signal-red" : ""}`}>{v}</p></div>))}
          </div>
          {validation.some((r) => !r.ok || r.warnings.length) && (
            <details open className="rounded-xl border border-canvas-line"><summary className="cursor-pointer px-4 py-3 font-bold">Issues found (first 50)</summary>
              <ul className="max-h-72 divide-y divide-canvas-line overflow-auto px-4 text-[13px]">{validation.filter((r) => !r.ok || r.warnings.length).slice(0, 50).map((r) => <li key={r.row} className="py-2"><span className="font-mono text-ink-400">Row {r.row}</span> {[...r.errors.map((e) => `✕ ${e}`), ...r.warnings.map((w) => `⚠ ${w}`)].join(" · ")}</li>)}</ul></details>)}
          <p className="text-[13px] text-ink-400">Rejected rows are skipped and reported; valid rows can still be imported. The server re-validates everything and also checks for records already in FactoryPilot.</p>
          <div className="flex gap-3"><button className="btn-dark btn-sm" disabled={!sum.valid} onClick={() => setStep(4)}>Preview {sum.valid} valid row(s)</button><button className="btn-ghost btn-sm" onClick={() => setStep(2)}>Adjust mapping</button></div>
        </div>)}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-[14px] text-ink-500">First 8 rows that will be imported:</p>
          <div className="overflow-x-auto rounded-lg border border-canvas-line"><table className="w-full text-[13px]"><thead className="bg-canvas-soft"><tr>{def.fields.filter((f) => mapping[f.key]).map((f) => <th key={f.key} className="th">{f.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-canvas-line">{validation.filter((r) => r.ok).slice(0, 8).map((r) => <tr key={r.row}>{def.fields.filter((f) => mapping[f.key]).map((f) => <td key={f.key} className="td !py-2 whitespace-nowrap">{String(r.value[f.key] ?? "—").slice(0, 60)}</td>)}</tr>)}</tbody></table></div>
          <div className="flex gap-3"><button className="btn-primary" onClick={() => { setStep(5); void run(); }}>Import {sum.valid} record(s)</button><button className="btn-ghost btn-sm" onClick={() => setStep(3)}>Back</button></div>
        </div>)}

      {step === 5 && <p role="status" className="text-[15px]">{busy ? "Importing… this can take a moment for large files." : "Preparing…"}</p>}

      {step === 6 && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-signal-greenbg p-4"><p className="text-[12px] font-semibold text-signal-green">Imported</p><p className="text-[28px] font-extrabold text-signal-green">{result.imported}</p></div>
            <div className="rounded-xl bg-canvas-soft p-4"><p className="text-[12px] font-semibold text-ink-400">Duplicates skipped</p><p className="text-[28px] font-extrabold">{result.duplicates}</p></div>
            <div className="rounded-xl bg-signal-redbg p-4"><p className="text-[12px] font-semibold text-signal-red">Rejected</p><p className="text-[28px] font-extrabold text-signal-red">{result.rejected}</p></div>
          </div>
          {result.rejectedRows.length > 0 && <details className="rounded-xl border border-canvas-line"><summary className="cursor-pointer px-4 py-3 font-bold">Rejected / skipped rows (first 100)</summary>
            <ul className="max-h-64 divide-y divide-canvas-line overflow-auto px-4 text-[13px]">{result.rejectedRows.map((r) => <li key={r.row} className="py-2"><span className="font-mono text-ink-400">Row {r.row} · {r.status}</span> {r.errors.join(" · ")}</li>)}</ul></details>}
          <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <p className="font-bold">Analyze</p>
            <p className="mt-1 text-[14px]">Your data is now part of FactoryPilot. Imported maintenance and incident history is searchable by keyword immediately; use “Index” in the Knowledge Base to enable semantic search.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {kind === "downtime_events" && <Link href="/app/downtime?days=365" className="btn-dark btn-sm">Open downtime intelligence</Link>}
              {kind === "equipment" && <Link href="/app/equipment" className="btn-dark btn-sm">View equipment</Link>}
              {(kind === "maintenance_records" || kind === "incidents" || kind === "shift_notes") && <Link href="/app/knowledge" className="btn-dark btn-sm">Open knowledge base</Link>}
              <button className="btn-ghost btn-sm" onClick={reset}>Import another file</button>
            </div>
          </div>
          {kind === "incidents" && <p className="text-[12px] text-ink-400">Historical incidents are imported with status “resolved”.</p>}
        </div>)}
    </div>
  );
}
