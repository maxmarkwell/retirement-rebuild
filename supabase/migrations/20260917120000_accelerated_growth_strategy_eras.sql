-- Retirement Rebuild
-- Accelerated Growth foundation
--
-- Preserve the legacy paper_active portfolio and its historical transactions/snapshots,
-- while giving future strategy implementations an explicit inception boundary and
-- reference-capital baseline. The portfolio's original starting_capital is intentionally
-- left unchanged so historical AI Active accounting is not rewritten.

create table if not exists public.portfolio_strategy_eras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  strategy_key text not null,
  strategy_version text not null,
  display_name text not null,
  inception_at timestamptz not null,
  reference_total_capital numeric not null check (reference_total_capital >= 0),
  execution_mode text not null default 'paper' check (execution_mode in ('paper', 'real')),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_strategy_eras_valid_window
    check (ended_at is null or ended_at > inception_at)
);

create unique index if not exists portfolio_strategy_eras_one_open_strategy
  on public.portfolio_strategy_eras (portfolio_id)
  where ended_at is null;

create index if not exists portfolio_strategy_eras_portfolio_inception_idx
  on public.portfolio_strategy_eras (portfolio_id, inception_at desc);

alter table public.portfolio_strategy_eras enable row level security;

create policy "Users can view their own portfolio strategy eras"
  on public.portfolio_strategy_eras
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own portfolio strategy eras"
  on public.portfolio_strategy_eras
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.portfolios p
      where p.id = portfolio_id
        and p.user_id = auth.uid()
    )
  );

create policy "Users can update their own portfolio strategy eras"
  on public.portfolio_strategy_eras
  for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.portfolios p
      where p.id = portfolio_id
        and p.user_id = auth.uid()
    )
  );

-- Convert each existing paper_active portfolio into the AG simulation environment
-- prospectively. Historical AI Active records remain untouched. The strategy-era
-- inception timestamp is the accounting boundary: transactions at or after inception
-- belong to AG; earlier transactions remain legacy AI Active history. $200 is reference
-- total capital for deterministic AG risk calculations; the v1 sleeve ceiling is 20% ($40).
-- The legacy portfolios.starting_capital value remains unchanged.
insert into public.portfolio_strategy_eras (
  user_id,
  portfolio_id,
  strategy_key,
  strategy_version,
  display_name,
  inception_at,
  reference_total_capital,
  execution_mode
)
select
  p.user_id,
  p.id,
  'accelerated_growth',
  'ag-v1',
  'Accelerated Growth',
  now(),
  200,
  'paper'
from public.portfolios p
where p.type = 'paper_active'
  and not exists (
    select 1
    from public.portfolio_strategy_eras pse
    where pse.portfolio_id = p.id
      and pse.ended_at is null
  );
