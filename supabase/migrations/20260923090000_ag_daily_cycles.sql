-- Authoritative daily-cycle ledger for Accelerated Growth.
-- A valid cycle may produce zero decisions and zero watches, so cycle completion
-- must be persisted independently from downstream investment artifacts.
create table public.ag_daily_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  strategy_era_id uuid not null references public.portfolio_strategy_eras(id) on delete cascade,
  cycle_date date not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  max_candidates integer not null check (max_candidates between 1 and 5),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_message text,
  universe_count integer,
  preselected_count integer,
  evaluated_count integer,
  discovery_advance_count integer,
  catalyst_supported_count integer,
  deep_research_completed_count integer,
  deep_research_failed_count integer,
  proceed_count integer,
  committee_decision_count integer,
  persisted_decision_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, strategy_era_id, cycle_date)
);

create index ag_daily_cycles_recent
  on public.ag_daily_cycles (user_id, portfolio_id, strategy_era_id, cycle_date desc);

alter table public.ag_daily_cycles enable row level security;

create policy "Users can view own AG daily cycles"
on public.ag_daily_cycles for select
using (auth.uid() = user_id);

create policy "Users can create own AG daily cycles"
on public.ag_daily_cycles for insert
with check (auth.uid() = user_id);

create policy "Users can update own AG daily cycles"
on public.ag_daily_cycles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
