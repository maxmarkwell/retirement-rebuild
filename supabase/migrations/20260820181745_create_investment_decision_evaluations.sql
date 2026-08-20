-- Retirement Rebuild
-- Investment Decision Evaluations
--
-- Evaluations record what happened AFTER an investment decision.
-- They do not overwrite the original thesis.

create table public.investment_decision_evaluations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  decision_id uuid not null
    references public.investment_decisions(id)
    on delete cascade,

  evaluation_date timestamptz not null default now(),

  evaluation_price numeric(18,8),

  return_since_decision_pct numeric(10,4),

  thesis_status text not null
    check (
      thesis_status in (
        'intact',
        'strengthened',
        'weakened',
        'invalidated'
      )
    ),

  recommendation_status text not null
    check (
      recommendation_status in (
        'continue',
        'reassess',
        'reduce',
        'exit',
        'closed'
      )
    ),

  what_was_right text,

  what_was_wrong text,

  new_information text,

  evaluation_summary text not null,

  source text not null default 'manual'
    check (
      source in (
        'manual',
        'ai_committee',
        'system'
      )
    ),

  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------

create index investment_decision_evaluations_user_id_idx
  on public.investment_decision_evaluations(user_id);

create index investment_decision_evaluations_decision_id_idx
  on public.investment_decision_evaluations(decision_id);

create index investment_decision_evaluations_date_idx
  on public.investment_decision_evaluations(evaluation_date desc);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.investment_decision_evaluations
enable row level security;

create policy "Users can view own decision evaluations"
on public.investment_decision_evaluations
for select
using (
  auth.uid() = user_id
);

create policy "Users can create own decision evaluations"
on public.investment_decision_evaluations
for insert
with check (
  auth.uid() = user_id
);

create policy "Users can update own decision evaluations"
on public.investment_decision_evaluations
for update
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
);

create policy "Users can delete own decision evaluations"
on public.investment_decision_evaluations
for delete
using (
  auth.uid() = user_id
);