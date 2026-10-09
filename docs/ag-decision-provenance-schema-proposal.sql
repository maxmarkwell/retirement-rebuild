-- PROPOSAL ONLY. DO NOT APPLY WITHOUT EXPLICIT MIGRATION APPROVAL.
-- Live read-only audit on 2026-10-05 confirmed investment_decisions.notes is
-- absent, while existing AG holding provenance and the atomic recovery design
-- require a durable text field. This nullable additive column preserves the
-- current application/draft contract without rewriting historical rows.
ALTER TABLE public.investment_decisions
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.investment_decisions.notes IS
  'Optional durable decision provenance/notes; AG holding review stores model and prompt provenance here.';

-- Deployment requirements:
-- * reconcile Supabase migration history drift before turning this proposal
--   into a numbered migration;
-- * run actual-schema disposable integration and security review first;
-- * applying this column alone does NOT authorize AG persistence/reactivation.
