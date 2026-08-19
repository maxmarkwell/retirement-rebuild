-- Retirement Rebuild
-- Investment Decision Journal
--
-- A transaction records WHAT happened.
-- An investment decision records WHY it happened.
--
-- Decisions may exist without transactions, such as HOLD or WATCH decisions.

create table public.investment_decisions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  portfolio_id uuid not null
    references public.portfolios(id)
    on delete cascade,

  transaction_id uuid
    references public.transactions(id)
    on delete set null,

  decision_type text not null
    check (
      decision_type in (
        'buy',
        'sell',
        'hold',
        'watch',
        'rebalance',
        'avoid'
      )
    ),

  ticker text not null,

  decision_date timestamptz not null default now(),

  decision_price numeric(18,8),

  recommended_quantity numeric(18,8),

  recommended_allocation numeric(18,2),

  confidence_score numeric(5,2)
    check (
      confidence_score is null
      or (
        confidence_score >= 0
        and confidence_score <= 100
      )
    ),

  risk_level text
    check (
      risk_level is null
      or risk_level in (
        'low',
        'medium',
        'high'
      )
    ),

  expected_holding_period text,

  thesis text not null,

  bull_case text,

  bear_case text,

  primary_risks text,

  reassessment_conditions text,

  exit_conditions text,

  source text not null default 'manual'
    check (
      source in (
        'manual',
        'ai_committee',
        'system'
      )
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'executed',
        'closed',
        'superseded'
      )
    ),

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------

create index investment_decisions_user_id_idx
  on public.investment_decisions(user_id);

create index investment_decisions_portfolio_id_idx
  on public.investment_decisions(portfolio_id);

create index investment_decisions_ticker_idx
  on public.investment_decisions(ticker);

create index investment_decisions_decision_date_idx
  on public.investment_decisions(decision_date desc);

create index investment_decisions_transaction_id_idx
  on public.investment_decisions(transaction_id);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.investment_decisions
enable row level security;

create policy "Users can view own investment decisions"
on public.investment_decisions
for select
using (
  auth.uid() = user_id
);

create policy "Users can create own investment decisions"
on public.investment_decisions
for insert
with check (
  auth.uid() = user_id
);

create policy "Users can update own investment decisions"
on public.investment_decisions
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

create policy "Users can delete own investment decisions"
on public.investment_decisions
for delete
using (
  auth.uid() = user_id
);