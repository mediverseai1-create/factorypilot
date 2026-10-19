import Link from "next/link";
import { PLANS } from "@/lib/billing/plans";

const STEPS = [
  ["Capture", "Operators speak or type a quick note, or log a machine event."],
  ["Structure", "AI organises it into a reviewable handover, with evidence quoted."],
  ["Connect", "Machines, lines and past incidents are linked from your own records."],
  ["Handover", "The outgoing shift confirms; the incoming shift acknowledges."],
  ["Investigate", "Recurring faults open evidence-based investigations and draft work orders."],
  ["Learn", "Confirmed resolutions become verified, searchable knowledge."],
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas-warm">
        <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div>
            <p className="eyebrow">AI shift intelligence for manufacturing</p>
            <h1 className="mt-5 text-[44px] font-extrabold leading-[1.04] tracking-tight sm:text-[64px]">Every shift knows what the last shift learned.</h1>
            <p className="mt-6 max-w-xl text-[19px] leading-relaxed text-ink-500">
              FactoryPilot turns operator notes, machine events, and maintenance history into intelligent shift handovers and searchable industrial knowledge, helping factory teams carry critical information forward and investigate recurring downtime.
            </p>
            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/signup" className="btn-primary px-8 py-4 text-base">Get started</Link>
              <Link href="#platform" className="btn-ghost px-8 py-4 text-base">Explore the platform</Link>
            </div>
            <p className="mt-8 text-[15px] font-bold tracking-wide text-ink-700">Capture · Understand · Handover · Investigate · Improve</p>
          </div>
          <HandoverMock />
        </div>
      </section>

      {/* Problem */}
      <section id="platform" className="mx-auto max-w-[1280px] px-6 py-24">
        <p className="eyebrow">The shift handover problem</p>
        <h2 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-tight tracking-tight">The most expensive information in a factory is the information that never reaches the next shift.</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            ["Incomplete notes", "A stop, a strange noise, a workaround. It lives in a notebook, a chat thread, or one operator's memory until the shift ends."],
            ["Undocumented troubleshooting", "The fix that worked, and the three that didn’t, is rediscovered from scratch the next time the same fault appears."],
            ["Knowledge that walks out the door", "When experienced technicians move on, years of machine-specific knowledge leave with them."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-xl2 bg-canvas-soft p-8">
              <h3 className="text-[20px] font-bold">{t}</h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-500">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Shift */}
      <section id="shift" className="bg-canvas-soft">
        <div className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 py-24 lg:grid-cols-2">
          <div>
            <p className="eyebrow">FactoryPilot Shift</p>
            <h2 className="mt-3 text-[40px] font-extrabold leading-tight tracking-tight">Say it in thirty seconds. Hand over it properly.</h2>
            <p className="mt-5 text-[18px] leading-relaxed text-ink-500">Operators type or speak what happened. The Handover Intelligence Engine identifies machines, events, actions taken and open concerns, links them to your equipment records and previous shifts, and flags what still needs a human answer.</p>
            <ul className="mt-7 space-y-3 text-[16px] text-ink-700">
              {["Machines and incidents resolved against your registry", "Every item backed by a quote from the original note", "Missing information is flagged, never silently filled in", "Unresolved issues carry into the next shift briefing automatically"].map((x) => (
                <li key={x} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="card p-7">
            <p className="text-[12px] font-bold uppercase tracking-wider text-ink-400">Operator note (illustrative)</p>
            <p className="mt-3 rounded-lg bg-canvas-soft p-4 text-[15px] italic leading-relaxed text-ink-700">“Press 3 stopped twice after the material change. We restarted it after checking the feed mechanism. It’s running now but it sounded unusual before the second stop. Maintenance should check it in the morning.”</p>
            <p className="mt-6 text-[12px] font-bold uppercase tracking-wider text-ink-400">Structured by FactoryPilot</p>
            <dl className="mt-3 divide-y divide-canvas-line text-[14px]">
              {[["Machine", "Press 3"], ["Event", "Two stoppages, after material change"], ["Action taken", "Feed mechanism checked; restarted"], ["Current state", "Reported running (not verified safe)"], ["Open concern", "Unusual sound before second stop"], ["Follow-up", "Maintenance inspection, morning shift"]].map(([k, v]) => (
                <div key={k} className="flex gap-4 py-2.5"><dt className="w-32 shrink-0 font-semibold text-ink-400">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Knowledge */}
      <section id="knowledge" className="mx-auto grid max-w-[1280px] items-center gap-14 px-6 py-24 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div className="card overflow-hidden">
            <div className="border-b border-canvas-line bg-canvas-soft px-6 py-4 text-[15px] font-semibold">“How did we resolve this fault last time?”</div>
            <div className="space-y-4 p-6 text-[14px]">
              <p className="text-ink-500">Answers cite the stored records they came from, with their verification level. If nothing reliable exists, FactoryPilot says so.</p>
              {[["Verified resolution", "bg-signal-greenbg text-signal-green"], ["Technician-confirmed", "bg-signal-bluebg text-signal-blue"], ["Operator-reported", "bg-canvas-soft text-ink-700"], ["AI suggestion (unverified)", "bg-amber-50 text-amber-700"]].map(([t, c]) => (
                <div key={t} className="flex items-center justify-between rounded-lg border border-canvas-line px-4 py-3"><span className="font-medium">Source record</span><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${c}`}>{t}</span></div>
              ))}
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="eyebrow">Industrial knowledge that persists</p>
          <h2 className="mt-3 text-[40px] font-extrabold leading-tight tracking-tight">Past incidents and confirmed fixes, searchable in plain language.</h2>
          <p className="mt-5 text-[18px] leading-relaxed text-ink-500">Handovers, incidents, maintenance actions and confirmed resolutions accumulate into an organisation-private knowledge base searched by meaning, not just keywords. An unverified suggestion is never silently promoted to official knowledge.</p>
        </div>
      </section>

      {/* Downtime */}
      <section id="downtime" className="bg-ink text-white">
        <div className="mx-auto max-w-[1280px] px-6 py-24">
          <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-amber">Downtime Intelligence</p>
          <h2 className="mt-3 max-w-3xl text-[40px] font-extrabold leading-tight tracking-tight">Connect stoppages, shifts and maintenance history to see what keeps coming back.</h2>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Recurring faults", "Repeated faults on the same machine, line or equipment type."],
              ["Pattern analysis", "Shift, changeover and operating-context patterns drawn only from recorded events."],
              ["Investigations", "Observed evidence, possible contributors and hypotheses kept strictly apart. Root causes need human confirmation."],
              ["Work-order drafts", "Evidence-packed drafts routed for approval before dispatch."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl2 bg-white/5 p-7 ring-1 ring-white/10">
                <h3 className="text-[18px] font-bold">{t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-white/70">{b}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 max-w-3xl text-[14px] text-white/55">FactoryPilot reports recorded downtime and flags patterns that warrant inspection. It does not claim predictive-maintenance accuracy and does not invent telemetry.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1280px] px-6 py-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 text-[40px] font-extrabold tracking-tight">Capture → Structure → Connect → Handover → Investigate → Learn</h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-xl2 border border-canvas-line bg-canvas-line md:grid-cols-3">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="bg-white p-8">
              <span className="text-[13px] font-bold text-amber-700">0{i + 1}</span>
              <h3 className="mt-2 text-[22px] font-extrabold">{t}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-500">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Teams */}
      <section id="teams" className="bg-canvas-warm">
        <div className="mx-auto max-w-[1280px] px-6 py-24">
          <p className="eyebrow">Built for factory teams</p>
          <h2 className="mt-3 text-[40px] font-extrabold tracking-tight">One record, four ways of working.</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              ["Operators", "Record in seconds on the floor. Confirm the report, hand it over."],
              ["Shift supervisors", "Review handovers, assign owners, approve work orders, escalate."],
              ["Maintenance technicians", "See a machine’s history, prior attempts and confirmed fixes before touching it."],
              ["Plant managers", "A real-time view of open issues, recurring faults and pending approvals."],
            ].map(([t, b]) => (
              <div key={t} className="rounded-xl2 bg-white p-7 shadow-card">
                <h3 className="text-[19px] font-bold">{t}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-500">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-[1280px] px-6 py-24">
        <div className="text-center">
          <p className="eyebrow">Pricing</p>
          <h2 className="mt-3 text-[40px] font-extrabold tracking-tight">Simple plans for the whole plant.</h2>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2">
          {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className={`rounded-xl2 p-9 ${id === "enterprise" ? "bg-ink text-white" : "border border-canvas-line bg-white shadow-card"}`}>
                <h3 className="text-[22px] font-extrabold">{p.name}</h3>
                <p className={`mt-1 text-[15px] ${id === "enterprise" ? "text-white/70" : "text-ink-500"}`}>{p.blurb}</p>
                <p className="mt-6"><span className="text-[52px] font-extrabold leading-none">${p.price}</span><span className="ml-1 text-[16px] opacity-70">/month</span></p>
                <ul className="mt-6 space-y-2.5 text-[15px]">
                  {p.features.map((f) => (<li key={f} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />{f}</li>))}
                </ul>
                <Link href={`/signup?plan=${id}`} className={`mt-8 w-full ${id === "enterprise" ? "btn-primary" : "btn-dark"}`}>Get started</Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-amber">
        <div className="mx-auto max-w-[1280px] px-6 py-20 text-center">
          <h2 className="text-[44px] font-extrabold leading-tight tracking-tight text-ink">Stop losing critical knowledge between shifts.</h2>
          <p className="mt-3 text-[22px] font-semibold text-ink/80">Start with FactoryPilot.</p>
          <Link href="/signup" className="btn-dark mt-9 px-9 py-4 text-base">Get started</Link>
        </div>
      </section>
    </>
  );
}

function HandoverMock() {
  return (
    <div className="relative" aria-label="Illustrative example handover">
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold uppercase tracking-wider text-ink-400">Night → Morning handover</p>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-100">Illustrative example</span>
        </div>
        <p className="mt-4 text-[17px] font-bold">Press 3 stopped twice after the material change</p>
        <div className="mt-4 space-y-3">
          {[
            ["Awaiting maintenance inspection", "Unusual sound reported before second stop", "bg-amber-50 text-amber-700"],
            ["Reported running", "Not confirmed safe: concern remains open", "bg-canvas-soft text-ink-700"],
            ["Missing information", "Fault code not recorded; confirm with operator", "bg-signal-redbg text-signal-red"],
          ].map(([a, b, c]) => (
            <div key={a} className="flex items-start justify-between gap-4 rounded-lg border border-canvas-line p-3.5">
              <div><p className="text-[14px] font-semibold">{a}</p><p className="mt-0.5 text-[13px] text-ink-500">{b}</p></div>
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${c.split(" ")[0]} ring-2 ring-current ${c.split(" ")[1]}`} />
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg bg-canvas-soft p-3.5 text-[13px] text-ink-700">
          <span className="font-bold">Continuity:</span> shown only when stored records support it, e.g. “1 similar incident on this machine in the last 90 days”.
        </div>
      </div>
    </div>
  );
}
