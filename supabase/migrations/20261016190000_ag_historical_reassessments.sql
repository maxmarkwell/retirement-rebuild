-- Independent, paper-only comparison ledger; does not modify investment decisions.
create table public.ag_historical_reassessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_decision_id uuid not null references public.investment_decisions(id) on delete cascade,
  ticker text not null,
  original_decision_type text not null,
  reassessed_decision_type text not null check (reassessed_decision_type in ('BUY','WATCH','REJECT')),
  original_thesis text not null,
  reassessment_thesis text not null,
  reassessment_rationale text not null,
  valuation_evidence text not null,
  valuation_data_quality text not null check (valuation_data_quality in ('QUANTIFIED','PARTIAL','UNAVAILABLE')),
  research_basis text not null check (research_basis in ('FRESH_RESEARCH','RECONSTRUCTED_HISTORICAL')),
  committee_model text not null,
  committee_prompt_version text not null,
  created_at timestamptz not null default now()
);
create index ag_historical_reassessments_user_recent
  on public.ag_historical_reassessments (user_id, created_at desc);
alter table public.ag_historical_reassessments enable row level security;
create policy "Users can read their own historical AG reassessments"
  on public.ag_historical_reassessments for select using (auth.uid() = user_id);
create policy "Users can insert their own historical AG reassessments"
  on public.ag_historical_reassessments for insert with check (
    auth.uid() = user_id and exists (
      select 1 from public.investment_decisions d
      where d.id = original_decision_id and d.user_id = auth.uid()
    )
  );
