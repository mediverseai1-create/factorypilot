-- FactoryPilot core schema. Every organisation-owned row carries org_id and is protected by RLS.
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto;

-- ───────────────────────── identity ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  retention_days int not null default 730 check (retention_days >= 30),
  require_work_order_approval boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','administrator','plant_manager','shift_supervisor','maintenance_technician','operator','quality_manager','viewer')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.organization_members (user_id);

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('administrator','plant_manager','shift_supervisor','maintenance_technician','operator','quality_manager','viewer')),
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

-- ───────────────────────── authorization helpers ─────────────────────────
create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from organization_members where org_id = p_org and user_id = auth.uid() and role = any(p_roles));
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── plant structure ─────────────────────────
create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);
create table public.production_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete cascade,
  name text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  line_id uuid references public.production_lines(id) on delete set null,
  name text not null,
  identifier text not null,
  equipment_type text,
  location text,
  manufacturer text,
  model text,
  status text not null default 'unknown' check (status in ('running','degraded','stopped','maintenance','unknown')),
  status_updated_at timestamptz,
  operating_limits text,
  maintenance_owner uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (org_id, identifier)
);
create index on public.equipment (org_id, line_id);

-- ───────────────────────── handovers & continuity ─────────────────────────
create table public.handovers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete set null,
  line_id uuid references public.production_lines(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  shift_label text,
  shift_date date not null default current_date,
  author_id uuid not null references auth.users(id),
  status text not null default 'draft' check (status in ('draft','submitted','acknowledged')),
  source_notes text not null default '',
  report jsonb,
  ai_run_id uuid,
  operator_confirmed boolean not null default false,
  reviewed_by uuid references auth.users(id),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.handovers (org_id, shift_date desc);

create table public.shift_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid references public.handovers(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  author_id uuid not null references auth.users(id),
  kind text not null default 'note' check (kind in ('note','voice','event')),
  body text not null,
  attachments jsonb not null default '[]',
  noted_at timestamptz not null default now()
);

create table public.handover_edits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid not null references public.handovers(id) on delete cascade,
  editor_id uuid not null references auth.users(id),
  summary text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create table public.handover_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid not null references public.handovers(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  unique (handover_id, user_id)
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  handover_id uuid references public.handovers(id) on delete set null,
  title text not null,
  description text,
  category text not null default 'fault' check (category in ('fault','safety','quality','material','process','other')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  fault_code text,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  shift_label text,
  reported_by uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.incidents (org_id, equipment_id, occurred_at desc);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  handover_id uuid references public.handovers(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  title text not null,
  detail text,
  kind text not null default 'issue' check (kind in ('issue','maintenance','safety','quality','material','inspection','corrective','other')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','assigned','awaiting_investigation','resolved')),
  owner_id uuid references auth.users(id),
  due_at timestamptz,
  source_quote text,
  shifts_carried int not null default 0,
  escalated boolean not null default false,
  resolution_note text,
  resolved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.follow_up_tasks (org_id, status);

-- ───────────────────────── downtime & maintenance ─────────────────────────
create table public.downtime_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  handover_id uuid references public.handovers(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes numeric,
  fault_code text,
  cause_category text,
  shift_label text,
  context text,
  source text not null default 'manual' check (source in ('manual','import','handover')),
  notes text,
  created_at timestamptz not null default now()
);
create index on public.downtime_events (org_id, equipment_id, started_at desc);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wo_number bigint generated always as identity,
  equipment_id uuid references public.equipment(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  investigation_id uuid,
  title text not null,
  symptoms text,
  incident_history text,
  attempted_actions text,
  recommended_inspection text,
  safety_notice text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','dispatched','in_progress','completed','cancelled')),
  assigned_to uuid references auth.users(id),
  assigned_team text,
  ai_drafted boolean not null default false,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.work_order_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved','rejected')),
  comment text,
  created_at timestamptz not null default now()
);
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  performed_at timestamptz not null default now(),
  performed_by text,
  action_type text,
  description text not null,
  parts_replaced text,
  outcome text not null default 'unknown' check (outcome in ('resolved','partial','not_resolved','unknown')),
  duration_minutes numeric,
  source text not null default 'manual' check (source in ('manual','import')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── investigations ─────────────────────────
create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  title text not null,
  reported_problem text not null,
  status text not null default 'open' check (status in ('open','in_progress','awaiting_confirmation','closed')),
  owner_id uuid references auth.users(id),
  ai_analysis jsonb,
  confirmed_root_cause text,
  root_cause_confirmed_by uuid references auth.users(id),
  resolution text,
  outcome text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table public.work_orders add constraint work_orders_investigation_fk foreign key (investigation_id) references public.investigations(id) on delete set null;

create table public.investigation_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  kind text not null check (kind in ('observed_evidence','possible_contributor','root_cause_hypothesis','confirmed_root_cause')),
  statement text not null,
  source_table text,
  source_id uuid,
  origin text not null default 'human' check (origin in ('human','ai')),
  review_status text not null default 'proposed' check (review_status in ('proposed','accepted','rejected')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.troubleshooting_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid not null references public.investigations(id) on delete cascade,
  description text not null,
  outcome text not null default 'unknown' check (outcome in ('worked','partial','failed','unknown')),
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── knowledge ─────────────────────────
create table public.operational_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  title text not null,
  doc_type text not null default 'manual' check (doc_type in ('manual','procedure','sop','other')),
  text_content text,
  storage_path text,
  approved boolean not null default false,
  approved_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.knowledge_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  title text not null,
  body text not null,
  kind text not null check (kind in ('handover_entry','incident','maintenance','resolution','procedure','lesson','manual','note')),
  verification text not null default 'operator_reported' check (verification in ('operator_reported','ai_interpretation','suggested_troubleshooting','technician_confirmed','supervisor_approved','verified_resolution')),
  source_table text,
  source_id uuid,
  fault_code text,
  shift_label text,
  tags text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  embedding extensions.vector(768),
  fts tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || coalesce(fault_code,''))) stored,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index knowledge_fts_idx on public.knowledge_records using gin (fts);
create index knowledge_org_idx on public.knowledge_records (org_id, equipment_id, occurred_at desc);
create index knowledge_embedding_idx on public.knowledge_records using hnsw (embedding extensions.vector_cosine_ops);

create table public.confirmed_resolutions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  investigation_id uuid references public.investigations(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  original_problem text not null,
  root_cause text,
  resolution text not null,
  actions_attempted text,
  unsuccessful_actions text,
  parts_replaced text,
  time_to_resolution_minutes numeric,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','recurred')),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  recurred_at timestamptz,
  knowledge_record_id uuid references public.knowledge_records(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ───────────────────────── AI, feedback, reporting ─────────────────────────
create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  agent text not null,
  task text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  input_summary text,
  output jsonb,
  error text,
  model text,
  prompt_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index on public.ai_agent_runs (org_id, created_at desc);

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.ai_agent_runs(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete cascade,
  kind text not null,
  title text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table public.feedback_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  target_table text not null,
  target_id uuid not null,
  rating text not null check (rating in ('helpful','incorrect','incomplete')),
  comment text,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  content jsonb not null,
  generated_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_table text,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity_logs (org_id, created_at desc);

-- ───────────────────────── ingestion & integrations ─────────────────────────
create table public.imported_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('equipment','downtime_events','maintenance_records','incidents','shift_notes')),
  filename text not null,
  status text not null default 'completed',
  total_rows int not null default 0,
  imported_rows int not null default 0,
  rejected_rows int not null default 0,
  duplicate_rows int not null default 0,
  mapping jsonb,
  summary jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.imported_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  file_id uuid not null references public.imported_files(id) on delete cascade,
  row_number int not null,
  status text not null check (status in ('imported','rejected','duplicate')),
  target_table text,
  target_id uuid,
  errors jsonb,
  raw jsonb
);
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('csv','cmms','mes','erp','scada','historian','other')),
  name text not null,
  status text not null default 'planned' check (status in ('planned','configured','active','error')),
  config jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ───────────────────────── billing ─────────────────────────
create table public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'none' check (plan in ('none','professional','enterprise')),
  status text not null default 'inactive' check (status in ('inactive','active','past_due','cancelled')),
  external_ref text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table public.credit_balances (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  balance int not null default 0,
  allowance_configured boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  feature text not null,
  credits int not null default 0,
  run_id uuid,
  created_at timestamptz not null default now()
);
create index on public.ai_usage (org_id, created_at desc);

-- ───────────────────────── RPCs ─────────────────────────
create or replace function public.create_organization(p_name text, p_industry text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations (name, industry, created_by) values (p_name, p_industry, auth.uid()) returning id into v_org;
  insert into organization_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into subscriptions (org_id) values (v_org);
  insert into credit_balances (org_id) values (v_org);
  insert into activity_logs (org_id, actor_id, action, entity_table, entity_id) values (v_org, auth.uid(), 'organization.created', 'organizations', v_org);
  return v_org;
end $$;

create or replace function public.accept_pending_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select * from organization_invites where lower(email) = lower(auth.jwt()->>'email') and accepted_at is null loop
    insert into organization_members (org_id, user_id, role) values (r.org_id, auth.uid(), r.role) on conflict do nothing;
    update organization_invites set accepted_at = now() where id = r.id;
    insert into activity_logs (org_id, actor_id, action, detail) values (r.org_id, auth.uid(), 'member.joined', jsonb_build_object('role', r.role));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Atomic server-side credit deduction (called with the service role only).
create or replace function public.consume_credits(p_org uuid, p_user uuid, p_feature text, p_credits int, p_run uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_bal credit_balances%rowtype;
begin
  select * into v_bal from credit_balances where org_id = p_org for update;
  if not found then return false; end if;
  if v_bal.allowance_configured then
    if v_bal.balance < p_credits then return false; end if;
    update credit_balances set balance = balance - p_credits, updated_at = now() where org_id = p_org;
    insert into credit_transactions (org_id, delta, reason, ref) values (p_org, -p_credits, p_feature, p_run::text);
  end if;
  insert into ai_usage (org_id, user_id, feature, credits, run_id) values (p_org, p_user, p_feature, p_credits, p_run);
  return true;
end $$;
revoke all on function public.consume_credits(uuid, uuid, text, int, uuid) from public, anon, authenticated;
grant execute on function public.consume_credits(uuid, uuid, text, int, uuid) to service_role;

-- Hybrid (semantic + keyword) retrieval. SECURITY INVOKER: RLS limits results to the caller's organisations.
create or replace function public.search_knowledge(p_org uuid, p_query text, p_embedding extensions.vector(768) default null, p_equipment uuid default null, p_limit int default 12)
returns table (id uuid, title text, body text, kind text, verification text, equipment_id uuid, source_table text, source_id uuid, fault_code text, occurred_at timestamptz, score double precision)
language sql stable security invoker set search_path = public, extensions as $$
  select k.id, k.title, k.body, k.kind, k.verification, k.equipment_id, k.source_table, k.source_id, k.fault_code, k.occurred_at,
    (case when p_embedding is not null and k.embedding is not null then 0.6 * (1 - (k.embedding <=> p_embedding)) else 0 end
     + 0.4 * ts_rank(k.fts, websearch_to_tsquery('english', p_query))) as score
  from knowledge_records k
  where k.org_id = p_org and is_member(p_org)
    and (p_equipment is null or k.equipment_id = p_equipment)
    and (k.fts @@ websearch_to_tsquery('english', p_query)
         or (p_embedding is not null and k.embedding is not null and (1 - (k.embedding <=> p_embedding)) > 0.55))
  order by score desc
  limit p_limit;
$$;

-- Retention helper: removes raw voice/note sources older than each org's retention window.
-- Schedule with pg_cron (e.g. daily); it is NOT scheduled automatically.
create or replace function public.purge_expired_source_notes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from shift_notes s using organizations o
   where s.org_id = o.id and s.noted_at < now() - make_interval(days => o.retention_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_source_notes() from public, anon, authenticated;

-- ───────────────────────── guard triggers ─────────────────────────
create or replace function public.guard_work_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_req boolean;
begin
  select require_work_order_approval into v_req from organizations where id = new.org_id;
  if tg_op = 'INSERT' and new.status not in ('draft','pending_approval') then
    raise exception 'new work orders must start as draft or pending_approval';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('approved','rejected','dispatched') then
    if v_req and not has_role(new.org_id, array['owner','administrator','plant_manager','shift_supervisor']) then
      raise exception 'only an authorised approver can approve or dispatch a work order';
    end if;
    if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  end if;
  return new;
end $$;
create trigger work_orders_guard before insert or update on public.work_orders for each row execute function public.guard_work_order();

create or replace function public.guard_knowledge_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification in ('technician_confirmed','verified_resolution') and (tg_op = 'INSERT' or new.verification is distinct from old.verification) then
    if not has_role(new.org_id, array['owner','administrator','plant_manager','shift_supervisor','maintenance_technician']) then
      raise exception 'technician-level role required for this verification level';
    end if;
  end if;
  if new.verification = 'supervisor_approved' and (tg_op = 'INSERT' or new.verification is distinct from old.verification) then
    if not has_role(new.org_id, array['owner','administrator','plant_manager','shift_supervisor']) then
      raise exception 'supervisor-level role required to approve knowledge';
    end if;
  end if;
  return new;
end $$;
create trigger knowledge_verification_guard before insert or update on public.knowledge_records for each row execute function public.guard_knowledge_verification();

-- Confirmed root causes need a technician-level human.
create or replace function public.guard_root_cause() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.confirmed_root_cause is not null and new.confirmed_root_cause is distinct from old.confirmed_root_cause then
    if not has_role(new.org_id, array['owner','administrator','plant_manager','shift_supervisor','maintenance_technician']) then
      raise exception 'only qualified staff may confirm a root cause';
    end if;
    new.root_cause_confirmed_by := auth.uid();
  end if;
  return new;
end $$;
create trigger investigations_root_cause_guard before update on public.investigations for each row execute function public.guard_root_cause();

-- ───────────────────────── Row Level Security ─────────────────────────
do $$
declare
  t text;
  all_org text[] := array['facilities','production_lines','shifts','equipment','shift_notes','handovers','handover_edits','handover_acknowledgements','incidents','follow_up_tasks','downtime_events','work_orders','work_order_approvals','maintenance_records','investigations','investigation_evidence','troubleshooting_steps','operational_documents','knowledge_records','confirmed_resolutions','ai_insights','feedback_records','reports','imported_files','imported_records','integrations'];
  config_tbl text[] := array['facilities','production_lines','shifts','integrations'];
  writers text := $r$array['owner','administrator','plant_manager','shift_supervisor','maintenance_technician','operator','quality_manager']$r$;
  managers text := $r$array['owner','administrator','plant_manager']$r$;
  staff text := $r$array['owner','administrator','plant_manager','shift_supervisor','maintenance_technician']$r$;
begin
  foreach t in array all_org loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(org_id))', t||'_sel', t);
    if t = any(config_tbl) then
      execute format('create policy %I on public.%I for insert with check (public.has_role(org_id, %s))', t||'_ins', t, managers);
      execute format('create policy %I on public.%I for update using (public.has_role(org_id, %s)) with check (public.has_role(org_id, %s))', t||'_upd', t, managers, managers);
    elsif t in ('equipment','operational_documents','downtime_events','maintenance_records','investigations','investigation_evidence','troubleshooting_steps','confirmed_resolutions','imported_files','imported_records') then
      execute format('create policy %I on public.%I for insert with check (public.has_role(org_id, %s))', t||'_ins', t, staff);
      execute format('create policy %I on public.%I for update using (public.has_role(org_id, %s)) with check (public.has_role(org_id, %s))', t||'_upd', t, staff, staff);
    elsif t = 'work_order_approvals' then
      execute format('create policy %I on public.%I for insert with check (public.has_role(org_id, array[''owner'',''administrator'',''plant_manager'',''shift_supervisor'']) and approver_id = auth.uid())', t||'_ins', t);
    else
      execute format('create policy %I on public.%I for insert with check (public.has_role(org_id, %s))', t||'_ins', t, writers);
      execute format('create policy %I on public.%I for update using (public.has_role(org_id, %s)) with check (public.has_role(org_id, %s))', t||'_upd', t, writers, writers);
    end if;
    if t not in ('work_order_approvals','handover_edits','handover_acknowledgements','feedback_records') then
      execute format('create policy %I on public.%I for delete using (public.has_role(org_id, %s))', t||'_del', t, managers);
    end if;
  end loop;
end $$;

-- profiles
alter table public.profiles enable row level security;
create policy profiles_sel on public.profiles for select using (
  id = auth.uid() or exists (select 1 from organization_members a join organization_members b on a.org_id = b.org_id where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- organizations & membership
alter table public.organizations enable row level security;
create policy orgs_sel on public.organizations for select using (public.is_member(id));
create policy orgs_upd on public.organizations for update using (public.has_role(id, array['owner','administrator'])) with check (public.has_role(id, array['owner','administrator']));

alter table public.organization_members enable row level security;
create policy members_sel on public.organization_members for select using (public.is_member(org_id));
create policy members_ins on public.organization_members for insert with check (public.has_role(org_id, array['owner']));
create policy members_upd on public.organization_members for update using (public.has_role(org_id, array['owner','administrator']))
  with check (public.has_role(org_id, array['owner','administrator']) and (role <> 'owner' or public.has_role(org_id, array['owner'])));
create policy members_del on public.organization_members for delete using (public.has_role(org_id, array['owner','administrator']) and role <> 'owner');

alter table public.organization_invites enable row level security;
create policy invites_sel on public.organization_invites for select using (public.has_role(org_id, array['owner','administrator']));
create policy invites_ins on public.organization_invites for insert with check (public.has_role(org_id, array['owner','administrator']) and invited_by = auth.uid());
create policy invites_del on public.organization_invites for delete using (public.has_role(org_id, array['owner','administrator']));

-- notifications: only the addressee
alter table public.notifications enable row level security;
create policy notifications_sel on public.notifications for select using (user_id = auth.uid());
create policy notifications_upd on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_ins on public.notifications for insert with check (public.is_member(org_id));

-- ai runs, logs, billing
alter table public.ai_agent_runs enable row level security;
create policy runs_sel on public.ai_agent_runs for select using (public.is_member(org_id));
alter table public.activity_logs enable row level security;
create policy logs_sel on public.activity_logs for select using (public.is_member(org_id));
create policy logs_ins on public.activity_logs for insert with check (public.is_member(org_id) and actor_id = auth.uid());
alter table public.ai_usage enable row level security;
create policy usage_sel on public.ai_usage for select using (public.is_member(org_id));
alter table public.subscriptions enable row level security;
create policy subs_sel on public.subscriptions for select using (public.is_member(org_id));
alter table public.credit_balances enable row level security;
create policy bal_sel on public.credit_balances for select using (public.is_member(org_id));
alter table public.credit_transactions enable row level security;
create policy tx_sel on public.credit_transactions for select using (public.has_role(org_id, array['owner','administrator','plant_manager']));
-- No client write policies on runs/usage/billing: those are written by the server with the service role.

-- ───────────────────────── storage ─────────────────────────
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
create policy attachments_read on storage.objects for select using (
  bucket_id = 'attachments' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy attachments_write on storage.objects for insert with check (
  bucket_id = 'attachments' and public.has_role(((storage.foldername(name))[1])::uuid,
    array['owner','administrator','plant_manager','shift_supervisor','maintenance_technician','operator','quality_manager']));
