-- DESIGN DRAFT ONLY: DO NOT APPLY TO SUPABASE.
-- Requires schema review, privilege review and integration tests in an isolated DB.
-- This ledger records cycle-scoped intent and prevents concurrent claims.
-- It does NOT by itself make investment_decisions writes atomic.

CREATE TABLE public.ag_cycle_decision_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  decision_kind text NOT NULL CHECK (decision_kind IN ('holding_review','committee')),
  -- SHA-256 of a canonicalized immutable decision payload; never use a
  -- timestamp or randomly generated key for retry identification.
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','committed','needs_manual_review')),
  investment_decision_id uuid REFERENCES public.investment_decisions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CONSTRAINT ag_cycle_decision_write_unique UNIQUE (cycle_id, ticker),
  CONSTRAINT ag_cycle_decision_write_commit_consistency CHECK (
    (status = 'committed' AND investment_decision_id IS NOT NULL AND committed_at IS NOT NULL)
    OR (status <> 'committed' AND committed_at IS NULL)
  )
);

CREATE INDEX ag_cycle_decision_writes_portfolio_idx
  ON public.ag_cycle_decision_writes(portfolio_id, created_at DESC);

ALTER TABLE public.ag_cycle_decision_writes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ag_cycle_decision_writes_owner_read
  ON public.ag_cycle_decision_writes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
-- No INSERT, UPDATE or DELETE policies. Only reviewed SECURITY DEFINER
-- RPCs may modify this ledger and investment_decisions together.

-- REQUIRED ATOMIC RPC (not implemented in this draft):
-- 1. Authenticate auth.uid(); lock ag_daily_cycles row FOR UPDATE.
-- 2. Confirm cycle is running and belongs to caller's active, non-real-money
--    paper AG portfolio and exact strategy era. Lock persistence checkpoint.
-- 3. Validate checkpoint claim token and lease. Refuse if interrupted or
--    already completed unless a verified committed ledger entry is returned.
-- 4. Lock the ledger key (cycle_id,ticker) using INSERT ... ON CONFLICT and
--    SELECT FOR UPDATE. Same key + different payload_hash MUST fail closed.
-- 5. Lock existing active ai_committee decision(s) for the same ticker and
--    active era. Multiple active rows require manual reconciliation.
-- 6. Apply existing lifecycle REUSE semantics, otherwise supersede existing
--    and INSERT replacement, and mark ledger committed IN ONE transaction.
-- 7. Validate all fields server-side; never blindly INSERT client JSON.
-- 8. If any step fails, roll back the entire transaction. A network timeout
--    after COMMIT requires a read-only ledger check, never blind retry.
-- 9. Do not create transactions. Transaction execution stays disabled.
-- 10. Watchlist mutations and other decision writes need their own equivalent
--     atomic/idempotent treatment before the persistence stage is enabled.
