-- Persist Deep Research WATCH candidates so Accelerated Growth can carry
-- unresolved research forward across cycles without creating Committee decisions.
create table public.ag_research_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  strategy_era_id uuid not null references public.portfolio_strategy_eras(id) on delete cascade,
  ticker text not null,
  company_name text,
  research_status text not null check (research_status in ('WATCH', 'STOP')),
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  thesis text not null,
  unresolved_questions text[] not null default '{}',
  thesis_clock text,
  invalidation text[] not null default '{}',
  model text not null,
  prompt_version text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('PROCEED', 'STOP', 'STALE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ag_research_watchlist_one_open_per_ticker
  on public.ag_research_watchlist (user_id, portfolio_id, strategy_era_id, ticker)
  where resolved_at is null;

alter table public.ag_research_watchlist enable row level security;

create policy "Users can view own AG research watchlist"
on public.ag_research_watchlist for select using (auth.uid() = user_id);

create policy "Users can create own AG research watchlist"
on public.ag_research_watchlist for insert with check (auth.uid() = user_id);

create policy "Users can update own AG research watchlist"
on public.ag_research_watchlist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
