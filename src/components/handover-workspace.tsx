"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VoiceRecorder } from "./voice-recorder";
import { ReportView } from "./report-view";
import { createClient } from "@/lib/supabase/client";
import { addVoiceNote, generateReport, saveNotes, saveReportEdit, submitHandover } from "@/app/app/handovers/actions";
import type { StoredReport } from "@/lib/ai/agents";
import { SECTION_TITLES } from "@/lib/ai/schemas";

type Props = { handoverId: string; orgId: string; initialNotes: string; initialReport: StoredReport | null; aiReady: boolean };
type Msg = { kind: "ok" | "err"; text: string } | null;

export function HandoverWorkspace({ handoverId, orgId, initialNotes, initialReport, aiReady }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [report, setReport] = useState<StoredReport | null>(initialReport);
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [files, setFiles] = useState<{ path: string; name: string }[]>([]);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ error?: string; message?: string } | undefined>, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r?.error) setMsg({ kind: "err", text: r.error });
      else { if (r?.message) setMsg({ kind: "ok", text: r.message }); after?.(); router.refresh(); }
    });

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const sb = createClient();
    const added: { path: string; name: string }[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 10 * 1024 * 1024) { setMsg({ kind: "err", text: `${f.name} is larger than 10 MB.` }); continue; }
      const path = `${orgId}/${handoverId}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await sb.storage.from("attachments").upload(path, f);
      if (error) setMsg({ kind: "err", text: `${f.name}: ${error.message}` }); else added.push({ path, name: f.name });
    }
    if (added.length) { setFiles((x) => [...x, ...added]); run(() => saveNotes(handoverId, notes, added)); }
  }

  const upd = (fn: (r: StoredReport) => void) => setReport((r) => { if (!r) return r; const c = structuredClone(r); fn(c); return c; });

  return (
    <div className="space-y-8">
      <section className="card p-6">
        <h2 className="text-[18px] font-bold">1 · Capture</h2>
        <p className="mt-1 text-[14px] text-ink-500">Write what happened in your own words, or record a voice note. Include the machine, what you saw, what you did, and what is still open.</p>
        <label htmlFor="notes" className="sr-only">Operator notes</label>
        <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={9} className="field mt-4 text-[16px] leading-relaxed" placeholder="e.g. Press 3 stopped twice after the material change. We restarted it after checking the feed mechanism…" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <VoiceRecorder onApprove={async (t) => { const r = await addVoiceNote(handoverId, t); if (r?.error) setMsg({ kind: "err", text: r.error }); else { setNotes((n) => `${n}${n ? "\n\n" : ""}[Voice note] ${t}`); setMsg({ kind: "ok", text: "Voice note added" }); } }} />
          <div className="rounded-xl border border-canvas-line p-4">
            <label className="label" htmlFor="files">Attach photos or documents</label>
            <input id="files" type="file" multiple accept="image/*,.pdf,.txt,.csv" onChange={(e) => upload(e.target.files)} className="block w-full text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
            {files.map((f) => <p key={f.path} className="mt-2 text-[13px] text-ink-500">📎 {f.name}</p>)}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => saveNotes(handoverId, notes))}>Save notes</button>
          <button className="btn-primary" disabled={pending || !notes.trim() || !aiReady} onClick={() => run(async () => { const r = await generateReport(handoverId, notes); return r; })}>
            {pending ? "Working…" : report ? "Regenerate AI report" : "Generate structured handover"}
          </button>
          {!aiReady && <span className="text-[13px] text-amber-700">AI is not configured (GEMINI_API_KEY missing): notes are saved but no report can be generated.</span>}
        </div>
        {report && <p className="mt-3 text-[13px] text-ink-400">Regenerating replaces the unsubmitted report. Your original notes are never overwritten by AI.</p>}
        {msg && <p role={msg.kind === "err" ? "alert" : "status"} className={`mt-4 rounded-lg px-3 py-2 text-[14px] font-medium ${msg.kind === "err" ? "bg-signal-redbg text-signal-red" : "bg-signal-greenbg text-signal-green"}`}>{msg.text}</p>}
      </section>

      {report && (
        <section className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold">2 · Review the AI-generated report</h2>
            <button className="btn-ghost btn-sm" onClick={() => setEditing(!editing)}>{editing ? "Done editing" : "Edit report"}</button>
          </div>
          <p className="mb-6 mt-1 text-[14px] text-ink-500">This is an AI interpretation of your notes. Correct anything wrong or missing before you confirm.</p>
          {editing ? (
            <div className="space-y-6">
              <div><label className="label">Summary</label><textarea className="field" rows={3} value={report.summary} onChange={(e) => upd((r) => { r.summary = e.target.value; })} /></div>
              {report.sections.map((s, si) => (
                <div key={s.key}>
                  <p className="label">{SECTION_TITLES[s.key]}</p>
                  {s.items.map((it, ii) => (
                    <div key={ii} className="mb-2 flex gap-2">
                      <input className="field" value={it.text} onChange={(e) => upd((r) => { r.sections[si].items[ii].text = e.target.value; })} />
                      <button className="btn-ghost btn-sm" onClick={() => upd((r) => { r.sections[si].items.splice(ii, 1); })} aria-label="Remove item">✕</button>
                    </div>))}
                </div>))}
              <div>
                <p className="label">Open issues</p>
                {report.issues.map((it, ii) => (
                  <div key={ii} className="mb-2 flex flex-wrap gap-2">
                    <input className="field flex-1" value={it.title} onChange={(e) => upd((r) => { r.issues[ii].title = e.target.value; })} />
                    <select className="field w-32" value={it.priority} onChange={(e) => upd((r) => { r.issues[ii].priority = e.target.value as "low"; })}>
                      {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <button className="btn-ghost btn-sm" onClick={() => upd((r) => { r.issues.splice(ii, 1); })} aria-label="Remove issue">✕</button>
                  </div>))}
                <button className="btn-ghost btn-sm" onClick={() => upd((r) => { r.issues.push({ title: "New issue", detail: "", kind: "issue", priority: "medium", priority_reason: "Added by operator", equipment_ref: null, source_quote: "", requires_escalation: false, suggested_follow_up: "" }); })}>+ Add issue</button>
              </div>
              <button className="btn-dark" disabled={pending} onClick={() => run(() => saveReportEdit(handoverId, JSON.stringify(report), "Operator edited the AI report"), () => setEditing(false))}>Save edits (logged)</button>
            </div>
          ) : <ReportView report={report} />}
        </section>
      )}

      {report && !editing && (
        <section className="card border-2 border-ink p-6">
          <h2 className="text-[18px] font-bold">3 · Confirm and hand over</h2>
          <label className="mt-4 flex items-start gap-3 text-[15px]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 accent-amber" />
            <span>I have read this report, corrected any errors, and confirm it accurately reflects my shift. I understand unresolved issues will be carried to the incoming shift.</span>
          </label>
          <button className="btn-primary mt-5" disabled={!confirmed || pending} onClick={() => run(() => submitHandover(handoverId, confirmed))}>Submit to incoming shift</button>
        </section>
      )}
    </div>
  );
}
