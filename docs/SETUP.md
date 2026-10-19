# FactoryPilot setup

## 1. Environment
Copy `.env.example` to `.env.local` and fill it in. Never commit real values (`.env*` is git-ignored except `.env.example`).

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Credit deduction, AI run logging, verified billing webhook |
| `GEMINI_API_KEY` | **Server only.** All AI features. Optional `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` |
| `PROFESSIONAL_PAYMENT_LINK`, `ENTERPRISE_PAYMENT_LINK` | External `https` payment pages ($57 / $97 per month) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret that authenticates subscription activation |
| `PROFESSIONAL_MONTHLY_CREDITS`, `ENTERPRISE_MONTHLY_CREDITS` | Leave blank until final allowances are decided; usage is then metered, not capped |
| `ALLOW_UNSUBSCRIBED_AI=true` | Optional evaluation override that lets an org without a paid plan use AI. Off by default |

## 2. Database
Apply `supabase/migrations/0001_factorypilot_schema.sql` (Supabase SQL editor or `supabase db push`). It creates all tables, RLS policies, guard triggers, the `consume_credits` and `search_knowledge` functions, the `attachments` storage bucket and its policies, and enables `vector` (pgvector).

In Supabase Auth settings add `http://localhost:3000/auth/callback` (and your production URL) to the redirect allow-list.

**Retention:** `purge_expired_source_notes()` deletes raw shift-note rows older than each organisation's retention window. It is **not scheduled automatically**; schedule it with `pg_cron`:
```sql
select cron.schedule('purge-source-notes', '0 3 * * *', 'select public.purge_expired_source_notes()');
```

## 3. Billing flow
1. A Plant Manager+ clicks a plan on **Usage & Billing**; `/api/billing/checkout` redirects to the configured payment link with `client_reference_id=<org id>`.
2. That redirect grants nothing. Access activates only when a **signed** request reaches `POST /api/billing/webhook`:
   `x-factorypilot-signature: hex(HMAC_SHA256(PAYMENT_WEBHOOK_SECRET, rawBody))` with body
   `{"event":"subscription.activated","org_id":"…","plan":"professional","event_id":"…"}`.
3. If your payment provider cannot send this shape, put a small adapter in front of the endpoint or activate subscriptions manually by writing to `subscriptions`. No processor is built in.

## 4. Verifying
```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```
`npm test` covers the deterministic logic (downtime statistics, CSV validation, entity grounding, safety screening, permissions). Authenticated flows and AI calls need real Supabase and Gemini credentials to exercise.
