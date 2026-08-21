-- Retirement Rebuild
-- Stock Discovery Candidates
--
-- Stores ranked stock candidates before they are sent
-- to the AI Investment Committee.

create table public.stock_discovery_candidates (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  portfolio_type text not null
    check (
      portfolio_type in (
        'paper_active',
        'paper_long_term'
      )
    ),

  ticker text not null,

  discovery_date date not null default current_date,

  quality_score numeric(5,2) not null default 0,
  growth_score numeric(5,2) not null default 0,
  valuation_score numeric(5,2) not null default 0,
  earnings_score numeric(5,2) not null default 0,
  risk_score numeric(5,2) not null default 0,
  portfolio_fit_score numeric(5,2) not null default 0,

  total_score numeric(5,2) not null default 0,

  reason_summary text,

  status text not null default 'new'
    check (
      status in (
        'new',
        'reviewed',
        'sent_to_committee',
        'rejected',
        'archived'
      )
    ),

  created_at timestamptz not null default now()
);

-- Prevent duplicate candidate rows for the same
-- ticker / portfolio type / discovery day.

create unique index stock_discovery_candidates_unique_daily_idx
  on public.stock_discovery_candidates (
    user_id,
    portfolio_type,
    ticker,
    discovery_date
  );

create index stock_discovery_candidates_user_id_idx
  on public.stock_discovery_candidates(user_id);

create index stock_discovery_candidates_portfolio_type_idx
  on public.stock_discovery_candidates(portfolio_type);

create index stock_discovery_candidates_total_score_idx
  on public.stock_discovery_candidates(total_score desc);

create index stock_discovery_candidates_status_idx
  on public.stock_discovery_candidates(status);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.stock_discovery_candidates
enable row level security;

create policy "Users can view own discovery candidates"
on public.stock_discovery_candidates
for select
using (
  auth.uid() = user_id
);

create policy "Users can create own discovery candidates"
on public.stock_discovery_candidates
for insert
with check (
  auth.uid() = user_id
);

create policy "Users can update own discovery candidates"
on public.stock_discovery_candidates
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

create policy "Users can delete own discovery candidates"
on public.stock_discovery_candidates
for delete
using (
  auth.uid() = user_id
);