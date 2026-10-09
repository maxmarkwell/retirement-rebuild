-- DESIGN DRAFT ONLY. DO NOT APPLY TO SUPABASE.
-- Durable retry evidence for watchlist mutations. The operation RPC must derive
-- payload_hash server-side and mutate target row + ledger in one transaction.
CREATE TABLE public.ag_cycle_watch_writes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  stream text NOT NULL CHECK (stream IN ('research_watch','committee_watch')),
  ticker text NOT NULL CHECK (ticker ~ '^[A-Z][A-Z0-9.-]{0,14}$'),
  action text NOT NULL CHECK (action IN (
    'upsert_watch','resolve_research','resolve_quantitative','supersede_committee'
  )),
  source_row_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','committed','needs_manual_review')),
  effect text CHECK (effect IS NULL OR effect IN ('applied','noop')),
  affected_row_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CONSTRAINT ag_cycle_watch_write_unique UNIQUE (cycle_id,stream,ticker),
  CONSTRAINT ag_cycle_watch_write_action_stream CHECK (
    (stream='research_watch' AND action IN (
      'upsert_watch','resolve_research','resolve_quantitative'))
    OR (stream='committee_watch' AND action='supersede_committee')
  ),
  CONSTRAINT ag_cycle_watch_write_source_required CHECK (
    (action IN ('resolve_quantitative','supersede_committee') AND source_row_id IS NOT NULL)
    OR action IN ('upsert_watch','resolve_research')
  ),
  CONSTRAINT ag_cycle_watch_write_commit_consistency CHECK (
    (status='committed' AND committed_at IS NOT NULL AND effect IS NOT NULL
      AND ((effect='applied' AND affected_row_id IS NOT NULL)
        OR (effect='noop' AND affected_row_id IS NULL)))
    OR (status<>'committed' AND committed_at IS NULL
      AND effect IS NULL AND affected_row_id IS NULL)
  )
);
CREATE INDEX ag_cycle_watch_writes_portfolio_idx
  ON public.ag_cycle_watch_writes(portfolio_id,created_at DESC);
ALTER TABLE public.ag_cycle_watch_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_watch_writes FROM anon, authenticated;
GRANT ALL ON TABLE public.ag_cycle_watch_writes TO service_role;
-- No direct authenticated table access. Reviewed SECURITY DEFINER RPCs are the
-- only authenticated read/write boundary for recovery evidence.
