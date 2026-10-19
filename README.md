# FactoryPilot

AI shift intelligence for manufacturing: operator notes → structured, evidence-linked handovers → persistent, searchable industrial knowledge, with downtime intelligence, investigations and approval-gated work-order drafts built in. *Every shift connected. Every lesson preserved.*

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres, Auth, Storage, RLS, pgvector) · Google Gemini · Zod · Recharts.

See [docs/SETUP.md](docs/SETUP.md) to configure and run.

## Architecture
`Capture → Understand → Connect → Reason → Handover → Investigate → Act → Verify → Learn`

- `src/lib/ai/gemini.ts`: the only module that calls Gemini (structured JSON validated with Zod, audio transcription, embeddings).
- `src/lib/ai/agents.ts` + `orchestrator.ts`: eight agents behind one `runAgent` path: entitlement check → run record → execution → metering → audit.
- `src/lib/grounding.ts`: entity resolution, quote verification and citation-ID checks run in code, not in the model.
- `src/lib/downtime.ts`: downtime statistics are deterministic; AI adds a labelled interpretation only.
- `src/lib/ai/safety.ts`: safety rules injected in every prompt, plus an output screen for advice that defeats guards, interlocks or lockout/tagout.
- `supabase/migrations`: schema, RLS, guard triggers (work-order approval, knowledge verification, root-cause confirmation).

## Behaviour guarantees
- No fabricated data: empty organisations see empty states; example content is labelled illustrative.
- Unverified AI output is never silently promoted: knowledge records carry a verification level; a DB trigger restricts who can raise it.
- A root cause is “confirmed” only by a qualified person; AI proposals are `proposed` until accepted.
- Work orders from AI start `pending_approval`; approving/dispatching is restricted by a DB trigger.
- Planned integrations (CMMS, MES, ERP, SCADA, historian) are labelled planned; only CSV import is supported. No live telemetry is simulated.
- Payments: external links only; access is activated by a signed webhook, never by a redirect.
