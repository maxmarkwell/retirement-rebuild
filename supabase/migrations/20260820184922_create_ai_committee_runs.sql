-- Retirement Rebuild
-- AI Investment Committee Runs
--
-- Stores the full committee process before a final investment decision
-- is created. This preserves the intermediate analysis for auditability.

create table public.ai_committee_runs (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  portfolio_id uuid not null
    references public.portfolios(id)
    on delete cascade,

  decision_id uuid
    references public.investment_decisions(id)
    on delete set null,

  ticker text not null,

  run_date timestamptz not null default now(),

  market_price numeric(18,8),

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'researching',
        'reviewing',
        'completed',
        'failed'
      )
    ),

  research_analysis text,

  bull_case text,

  bear_case text,

  risk_analysis text,

  portfolio_analysis text,

  final_recommendation text
    check (
      final_recommendation is null
      or final_recommendation in (
        'buy',
        'sell',
        'hold',
        'watch',
        'avoid',
        'rebalance'
      )
    ),

  final_confidence numeric(5,2)
    check (
      final_confidence is null
      or (
        final_confidence >= 0
        and final_confidence <= 100
      )
    ),

  final_risk_level text
    check (
      final_risk_level is null
      or final_risk_level in (
        'low',
        'medium',
        'high'
      )
    ),

  recommended_allocation numeric(18,2),

  expected_holding_period text,

  final_thesis text,

  reassessment_conditions text,

  exit_conditions text,

  model_name text,

  prompt_version text,

  error_message text,

  created_at timestamptz not null default now(),

  completed_at timestamptz
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index ai_committee_runs_user_id_idx
  on public.ai_committee_runs(user_id);

create index ai_committee_runs_portfolio_id_idx
  on public.ai_committee_runs(portfolio_id);

create index ai_committee_runs_ticker_idx
  on public.ai_committee_runs(ticker);

create index ai_committee_runs_run_date_idx
  on public.ai_committee_runs(run_date desc);

create index ai_committee_runs_decision_id_idx
  on public.ai_committee_runs(decision_id);

create index ai_committee_runs_status_idx
  on public.ai_committee_runs(status);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.ai_committee_runs
enable row level security;

create policy "Users can view own AI committee runs"
on public.ai_committee_runs
for select
using (
  auth.uid() = user_id
);

create policy "Users can create own AI committee runs"
on public.ai_committee_runs
for insert
with check (
  auth.uid() = user_id
);

create policy "Users can update own AI committee runs"
on public.ai_committee_runs
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

create policy "Users can delete own AI committee runs"
on public.ai_committee_runs
for delete
using (
  auth.uid() = user_id
);