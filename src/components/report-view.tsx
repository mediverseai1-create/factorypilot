import Link from "next/link";
import { Badge, priorityTone } from "@/components/ui";
import { SECTION_KEYS, SECTION_TITLES } from "@/lib/ai/schemas";
import type { StoredReport } from "@/lib/ai/agents";

export function ReportView({ report }: { report: StoredReport }) {
  const m = report.meta;
  const eqLink = (ref: string | null) => {
    const e = ref ? m?.equipment_map?.[ref] : null;
    return e ? <Link href={`/app/equipment/${e.id}`} className="font-semibold underline decoration-amber decoration-2 underline-offset-2">{ref}</Link> : ref ? <span title="Not matched to a registered machine">{ref} <Badge tone="amber">unmatched</Badge></span> : null;
  };
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-400">1 · Shift summary</h3>
        <p className="mt-2 text-[17px] leading-relaxed">{report.summary}</p>
      </div>

      {report.machine_events.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-400">Machine events</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {report.machine_events.map((e, i) => (
              <div key={i} className="rounded-xl border border-canvas-line p-4">
                <p className="text-[16px] font-bold">{eqLink(e.equipment_ref)}: {e.event}</p>
                <dl className="mt-3 space-y-1.5 text-[14px]">
                  {([["Context", e.context], ["Action taken", e.action_taken], ["Reported state", e.current_state], ["Outstanding concern", e.outstanding_concern]] as const).map(([k, v]) => v ? (
                    <div key={k} className="flex gap-3"><dt className="w-36 shrink-0 text-ink-400">{k}</dt><dd className="font-medium">{v}</dd></div>) : null)}
                  {e.stoppage_count != null && <div className="flex gap-3"><dt className="w-36 shrink-0 text-ink-400">Stoppages</dt><dd className="font-medium">{e.stoppage_count}</dd></div>}
                </dl>
                {e.evidence_quote && <p className="mt-3 border-l-2 border-amber pl-3 text-[13px] italic text-ink-500">“{e.evidence_quote}”</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {SECTION_KEYS.map((k, idx) => {
        const s = report.sections.find((x) => x.key === k);
        if (!s || !s.items.length) return null;
        return (
          <div key={k}>
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-400">{idx + 2} · {SECTION_TITLES[k]}</h3>
            <ul className="mt-2 space-y-2">
              {s.items.map((it, i) => (
                <li key={i} className="rounded-lg bg-canvas-soft px-4 py-3 text-[15px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{it.text}</span>
                    {it.equipment_ref && <span className="text-[13px]">· {eqLink(it.equipment_ref)}</span>}
                    {it.finding === "confirmed_negative" && <Badge tone="green">Confirmed by operator</Badge>}
                    {it.finding === "not_stated" && <Badge tone="amber">Not stated</Badge>}
                    {it.needs_confirmation && <Badge tone="red">Needs confirmation</Badge>}
                  </div>
                  {it.evidence_quote && <p className="mt-1 text-[12px] italic text-ink-400">“{it.evidence_quote}”</p>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {report.issues.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-400">Open issues carried to the next shift</h3>
          <ul className="mt-3 space-y-3">
            {report.issues.map((i, n) => (
              <li key={n} className="rounded-xl border border-canvas-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={priorityTone(i.priority)}>{i.priority}</Badge><Badge>{i.kind}</Badge>
                  {i.requires_escalation && <Badge tone="red">Escalate</Badge>}
                  <p className="font-bold">{i.title}</p>
                </div>
                {i.detail && <p className="mt-2 text-[14px] text-ink-500">{i.detail}</p>}
                {i.priority_reason && <p className="mt-1 text-[13px] text-ink-400">Priority basis: {i.priority_reason}</p>}
                {i.suggested_follow_up && <p className="mt-1 text-[13px]"><span className="font-semibold">Suggested follow-up:</span> {i.suggested_follow_up}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {m?.continuity && (m.continuity.open_items_before > 0 || m.continuity.prior_incidents.length > 0) && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-amber-700">Continuity (from stored records)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
            {m.continuity.open_items_before > 0 && <li>{m.continuity.open_items_before} issue(s) remain open from earlier shifts{m.continuity.open_same_line > 0 ? `, ${m.continuity.open_same_line} on the same line as machines in this handover` : ""}.</li>}
            {m.continuity.prior_incidents.map((p) => (<li key={p.equipment}>{p.equipment}: {p.count} earlier incident record(s) in the last 90 days.</li>))}
          </ul>
        </div>
      )}

      {report.related_history.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-ink-400">14 · Relevant historical records</h3>
          <ul className="mt-2 space-y-1.5 text-[14px]">{report.related_history.map((r, i) => (<li key={i}><span className="font-mono text-[12px] text-ink-400">{r.record_id.split(":")[0]}</span> · {r.note}</li>))}</ul>
        </div>
      )}

      {(report.missing_information.length > 0 || report.confirmation_flags.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {report.missing_information.length > 0 && (
            <div className="rounded-xl bg-signal-redbg p-4"><h3 className="text-[13px] font-bold uppercase tracking-wider text-signal-red">Missing or ambiguous information</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">{report.missing_information.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
          {report.confirmation_flags.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-100"><h3 className="text-[13px] font-bold uppercase tracking-wider text-amber-700">Confirm before submitting</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">{report.confirmation_flags.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
        </div>
      )}

      {m && (
        <p className="text-[12px] text-ink-400">
          AI-generated {new Date(m.generated_at).toLocaleString("en-GB")} · {m.model} · {m.quote_check.verified} evidence quote(s) verified against the original notes{m.quote_check.unverified ? `, ${m.quote_check.unverified} not found` : ""}. AI interpretation requires operator and supervisor review.
        </p>
      )}
    </div>
  );
}
