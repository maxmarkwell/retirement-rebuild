-- Retirement Rebuild
-- Persist deterministic AG theme attribution on Committee decisions.
-- Execution fails closed when a BUY has no versioned theme key.

alter table public.investment_decisions
  add column if not exists ag_theme_key text;

comment on column public.investment_decisions.ag_theme_key is
  'Deterministic AG concentration bucket used for theme-cap accounting; null for non-AG/legacy decisions.';
