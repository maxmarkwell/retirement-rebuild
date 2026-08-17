-- Retirement Rebuild
-- Phase 1 initial schema

create extension if not exists pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================

create type portfolio_type as enum (
  'real',
  'paper_active',
  'paper_long_term',
  'benchmark'
);

create type transaction_type as enum (
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'dividend',
  'interest',
  'fee'
);

create type recommendation_decision as enum (
  'consider',
  'wait',
  'avoid',
  'hold',
  'reduce',
  'exit'
);

create type risk_level as enum (
  'low',
  'medium',
  'high',
  'speculative'
);

create type ai_run_status as enum (
  'started',
  'completed',
  'failed'
);

-- =========================================================
-- PORTFOLIOS
-- =========================================================

create table portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  type portfolio_type not null,

  starting_capital numeric(14,2) not null default 0,
  is_real_money boolean not null default false,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  unique (user_id, name)
);

create index portfolios_user_id_idx
  on portfolios(user_id);

-- =========================================================
-- CONTRIBUTIONS
-- Explicitly separates outside capital from investment growth.
-- =========================================================

create table contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,

  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null,
  notes text,

  created_at timestamptz not null default now()
);

create index contributions_user_id_idx
  on contributions(user_id);

create index contributions_portfolio_id_idx
  on contributions(portfolio_id);

-- =========================================================
-- TRANSACTIONS
-- Permanent ledger of portfolio activity.
-- =========================================================

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,

  transaction_type transaction_type not null,

  ticker text,
  quantity numeric(20,8),
  price_per_share numeric(20,8),
  gross_amount numeric(14,2),
  fees numeric(14,2) not null default 0,

  transaction_date timestamptz not null,

  notes text,

  created_at timestamptz not null default now(),

  check (
    ticker is null
    or ticker = upper(ticker)
  )
);

create index transactions_user_id_idx
  on transactions(user_id);

create index transactions_portfolio_id_idx
  on transactions(portfolio_id);

create index transactions_ticker_idx
  on transactions(ticker);

create index transactions_date_idx
  on transactions(transaction_date);

-- =========================================================
-- HOLDINGS
-- Current calculated state for fast display.
-- Transaction history remains the source of truth.
-- =========================================================

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,

  ticker text not null,
  quantity numeric(20,8) not null default 0,
  average_cost numeric(20,8) not null default 0,

  updated_at timestamptz not null default now(),

  unique (portfolio_id, ticker),

  check (ticker = upper(ticker))
);

create index holdings_user_id_idx
  on holdings(user_id);

create index holdings_portfolio_id_idx
  on holdings(portfolio_id);

-- =========================================================
-- STOCK CANDIDATES
-- Securities placed into the research pipeline.
-- =========================================================

create table stock_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  ticker text not null,
  company_name text,

  source text,
  status text not null default 'new',

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (ticker = upper(ticker))
);

create index stock_candidates_user_id_idx
  on stock_candidates(user_id);

create index stock_candidates_ticker_idx
  on stock_candidates(ticker);

-- =========================================================
-- AI RUNS
-- One complete Investment Committee analysis event.
-- =========================================================

create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  ticker text not null,

  status ai_run_status not null default 'started',

  model_provider text not null,
  model_name text not null,
  model_version text,

  prompt_version text,

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  input_snapshot jsonb,
  committee_output jsonb,

  error_message text,

  created_at timestamptz not null default now(),

  check (ticker = upper(ticker))
);

create index ai_runs_user_id_idx
  on ai_runs(user_id);

create index ai_runs_ticker_idx
  on ai_runs(ticker);

create index ai_runs_started_at_idx
  on ai_runs(started_at);

-- =========================================================
-- AI RECOMMENDATIONS
-- Immutable after creation.
-- =========================================================

create table ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  ai_run_id uuid not null references ai_runs(id),
  portfolio_id uuid references portfolios(id),

  ticker text not null,

  market_price numeric(20,8) not null,

  fundamental_score numeric(4,2),
  technical_score numeric(4,2),
  portfolio_fit_score numeric(4,2),

  risk risk_level not null,
  decision recommendation_decision not null,

  suggested_allocation_pct numeric(6,3)
    check (
      suggested_allocation_pct is null
      or (
        suggested_allocation_pct >= 0
        and suggested_allocation_pct <= 100
      )
    ),

  expected_holding_period text,

  bull_case text,
  bear_case text,
  primary_risk text,
  investment_thesis text,
  invalidation_conditions text,
  exit_conditions text,

  full_reasoning jsonb,

  model_provider text not null,
  model_name text not null,
  model_version text,
  prompt_version text,

  recommended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  check (ticker = upper(ticker)),

  check (
    fundamental_score is null
    or fundamental_score between 0 and 10
  ),

  check (
    technical_score is null
    or technical_score between 0 and 10
  ),

  check (
    portfolio_fit_score is null
    or portfolio_fit_score between 0 and 10
  )
);

create index ai_recommendations_user_id_idx
  on ai_recommendations(user_id);

create index ai_recommendations_ticker_idx
  on ai_recommendations(ticker);

create index ai_recommendations_recommended_at_idx
  on ai_recommendations(recommended_at);

create index ai_recommendations_ai_run_id_idx
  on ai_recommendations(ai_run_id);

-- =========================================================
-- IMMUTABILITY
-- Once created, AI recommendations cannot be updated/deleted.
-- =========================================================

create or replace function prevent_ai_recommendation_changes()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception
    'AI recommendations are immutable and cannot be updated or deleted';
end;
$$;

create trigger prevent_ai_recommendation_update
before update on ai_recommendations
for each row
execute function prevent_ai_recommendation_changes();

create trigger prevent_ai_recommendation_delete
before delete on ai_recommendations
for each row
execute function prevent_ai_recommendation_changes();

-- =========================================================
-- PAPER TRADES
-- Records virtual execution separately from recommendation.
-- =========================================================

create table paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,

  recommendation_id uuid references ai_recommendations(id),

  ticker text not null,
  action transaction_type not null,

  quantity numeric(20,8) not null,
  execution_price numeric(20,8) not null,

  executed_at timestamptz not null,

  notes text,

  created_at timestamptz not null default now(),

  check (ticker = upper(ticker)),
  check (action in ('buy', 'sell'))
);

create index paper_trades_user_id_idx
  on paper_trades(user_id);

create index paper_trades_portfolio_id_idx
  on paper_trades(portfolio_id);

create index paper_trades_recommendation_id_idx
  on paper_trades(recommendation_id);

-- =========================================================
-- BENCHMARKS
-- =========================================================

create table benchmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  ticker text not null,

  description text,

  active_from date not null,
  active_to date,

  reason_selected text,

  created_at timestamptz not null default now(),

  check (ticker = upper(ticker))
);

create index benchmarks_user_id_idx
  on benchmarks(user_id);

-- =========================================================
-- MARKET PRICES
-- End-of-day / historical market data cache.
-- =========================================================

create table market_prices (
  id bigint generated always as identity primary key,

  ticker text not null,
  price_date date not null,

  open numeric(20,8),
  high numeric(20,8),
  low numeric(20,8),
  close numeric(20,8) not null,
  adjusted_close numeric(20,8),
  volume bigint,

  data_source text not null,

  created_at timestamptz not null default now(),

  unique (ticker, price_date, data_source),

  check (ticker = upper(ticker))
);

create index market_prices_ticker_date_idx
  on market_prices(ticker, price_date desc);

-- =========================================================
-- PORTFOLIO SNAPSHOTS
-- Used for performance, drawdown, benchmark comparison, etc.
-- =========================================================

create table portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references portfolios(id) on delete cascade,

  snapshot_date date not null,

  cash_value numeric(14,2) not null default 0,
  holdings_value numeric(14,2) not null default 0,
  total_value numeric(14,2) not null default 0,

  cumulative_contributions numeric(14,2) not null default 0,
  cumulative_withdrawals numeric(14,2) not null default 0,

  investment_growth numeric(14,2) not null default 0,

  created_at timestamptz not null default now(),

  unique (portfolio_id, snapshot_date)
);

create index portfolio_snapshots_user_id_idx
  on portfolio_snapshots(user_id);

create index portfolio_snapshots_portfolio_date_idx
  on portfolio_snapshots(portfolio_id, snapshot_date desc);

-- =========================================================
-- APPLICATION EXPENSES
-- Tracks AI/API operating cost.
-- =========================================================

create table app_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  expense_date date not null,
  provider text not null,
  category text not null,

  amount numeric(10,4) not null check (amount >= 0),

  notes text,

  created_at timestamptz not null default now()
);

create index app_expenses_user_id_idx
  on app_expenses(user_id);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table portfolios enable row level security;
alter table contributions enable row level security;
alter table transactions enable row level security;
alter table holdings enable row level security;
alter table stock_candidates enable row level security;
alter table ai_runs enable row level security;
alter table ai_recommendations enable row level security;
alter table paper_trades enable row level security;
alter table benchmarks enable row level security;
alter table market_prices enable row level security;
alter table portfolio_snapshots enable row level security;
alter table app_expenses enable row level security;

-- =========================================================
-- USER-OWNED TABLE POLICIES
-- Phase 1 is single-user, but ownership is still explicit.
-- =========================================================

create policy "Users manage own portfolios"
on portfolios
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own contributions"
on contributions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own transactions"
on transactions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own holdings"
on holdings
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own stock candidates"
on stock_candidates
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own AI runs"
on ai_runs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can read own AI recommendations"
on ai_recommendations
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create own AI recommendations"
on ai_recommendations
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users manage own paper trades"
on paper_trades
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own benchmarks"
on benchmarks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own snapshots"
on portfolio_snapshots
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage own app expenses"
on app_expenses
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Market-price data is shared reference data.
create policy "Authenticated users can read market prices"
on market_prices
for select
to authenticated
using (true);