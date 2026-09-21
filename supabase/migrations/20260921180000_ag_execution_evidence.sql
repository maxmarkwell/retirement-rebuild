-- Retirement Rebuild
-- Persist the AG execution evidence established by research/Committee so the
-- executor no longer substitutes hard-coded thesis/liquidity booleans.

alter table public.investment_decisions
  add column if not exists ag_thesis_valid boolean,
  add column if not exists ag_liquidity_eligible boolean,
  add column if not exists ag_evidence_version text;

comment on column public.investment_decisions.ag_thesis_valid is
  'AG Committee/research evidence gate persisted at decision creation; null for non-AG/legacy decisions.';
comment on column public.investment_decisions.ag_liquidity_eligible is
  'AG deterministic liquidity evidence gate persisted at decision creation; null for non-AG/legacy decisions.';
comment on column public.investment_decisions.ag_evidence_version is
  'Version identifier for persisted AG execution evidence semantics.';
