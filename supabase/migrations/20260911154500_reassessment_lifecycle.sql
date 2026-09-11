-- Retirement Rebuild
-- Formalize WATCH reassessment lifecycle.
--
-- The application already creates and consumes investment_reassessments.
-- This migration makes that schema explicit in source control and adds
-- database-level lifecycle protection for superseding prior decisions.

create table if not exists public.investment_reassessments (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  portfolio_id uuid not null
    references public.portfolios(id)
    on delete cascade,

  decision_id uuid not null
    references public.investment_decisions(id)
    on delete cascade,

  ticker text not null,

  status text not null default 'pending',

  trigger_type text not null default 'scheduled',

  scheduled_for timestamptz,
  triggered_at timestamptz,
  trigger_reason text,

  prior_decision_type text,
  prior_confidence numeric(5,2),
  prior_price numeric(18,8),

  evidence_snapshot jsonb,

  completed_at timestamptz,
  new_decision_type text,
  new_confidence numeric(5,2),
  reassessment_price numeric(18,8),
  reassessment_summary text,

  created_at timestamptz not null default now()
);

-- Keep existing remotely-created tables compatible with the app if this
-- schema was introduced manually before it was committed as a migration.
alter table public.investment_reassessments
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade,
  add column if not exists decision_id uuid references public.investment_decisions(id) on delete cascade,
  add column if not exists ticker text,
  add column if not exists status text default 'pending',
  add column if not exists trigger_type text default 'scheduled',
  add column if not exists scheduled_for timestamptz,
  add column if not exists triggered_at timestamptz,
  add column if not exists trigger_reason text,
  add column if not exists prior_decision_type text,
  add column if not exists prior_confidence numeric(5,2),
  add column if not exists prior_price numeric(18,8),
  add column if not exists evidence_snapshot jsonb,
  add column if not exists completed_at timestamptz,
  add column if not exists new_decision_type text,
  add column if not exists new_confidence numeric(5,2),
  add column if not exists reassessment_price numeric(18,8),
  add column if not exists reassessment_summary text,
  add column if not exists created_at timestamptz default now();

-- Validate lifecycle values without depending on whether a prior manual
-- version of the table already had constraints.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'investment_reassessments_status_check'
      and conrelid = 'public.investment_reassessments'::regclass
  ) then
    alter table public.investment_reassessments
      add constraint investment_reassessments_status_check
      check (status in ('pending', 'ready', 'completed', 'cancelled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'investment_reassessments_trigger_type_check'
      and conrelid = 'public.investment_reassessments'::regclass
  ) then
    alter table public.investment_reassessments
      add constraint investment_reassessments_trigger_type_check
      check (trigger_type in ('earnings', 'scheduled', 'material_event'));
  end if;
end
$$;

create index if not exists investment_reassessments_user_id_idx
  on public.investment_reassessments(user_id);

create index if not exists investment_reassessments_portfolio_id_idx
  on public.investment_reassessments(portfolio_id);

create index if not exists investment_reassessments_decision_id_idx
  on public.investment_reassessments(decision_id);

create index if not exists investment_reassessments_ticker_idx
  on public.investment_reassessments(ticker);

create index if not exists investment_reassessments_status_idx
  on public.investment_reassessments(status);

create index if not exists investment_reassessments_scheduled_for_idx
  on public.investment_reassessments(scheduled_for);

-- Only one live reassessment should exist for a given originating decision.
-- If historical duplicates exist, leave them intact and let the application
-- surface them for cleanup rather than making this migration destructive.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'investment_reassessments_one_active_per_decision_idx'
  ) and not exists (
    select 1
    from public.investment_reassessments
    where status in ('pending', 'ready')
    group by decision_id
    having count(*) > 1
  ) then
    create unique index investment_reassessments_one_active_per_decision_idx
      on public.investment_reassessments(decision_id)
      where status in ('pending', 'ready');
  end if;
end
$$;

alter table public.investment_reassessments
enable row level security;

drop policy if exists "Users can view own investment reassessments"
  on public.investment_reassessments;
create policy "Users can view own investment reassessments"
  on public.investment_reassessments
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own investment reassessments"
  on public.investment_reassessments;
create policy "Users can create own investment reassessments"
  on public.investment_reassessments
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own investment reassessments"
  on public.investment_reassessments;
create policy "Users can update own investment reassessments"
  on public.investment_reassessments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Completing a reassessment means the originating decision is historical.
-- Preserve it for auditability, but remove it from the active decision set.
create or replace function public.supersede_reassessed_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.decision_id is not null then
    update public.investment_decisions
    set status = 'superseded'
    where id = new.decision_id
      and user_id = new.user_id
      and status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists investment_reassessments_supersede_decision
  on public.investment_reassessments;

create trigger investment_reassessments_supersede_decision
after update of status
on public.investment_reassessments
for each row
execute function public.supersede_reassessed_decision();
