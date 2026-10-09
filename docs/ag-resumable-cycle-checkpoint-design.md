# AG resumable cycle checkpoint migration (proposal; NOT applied)

The legacy daily-cycle endpoint remains paused. Do not enable it merely because this schema exists.

## Required invariants

- A checkpoint belongs to exactly one existing `ag_daily_cycles` record and its user, paper portfolio, and active strategy era.
- Stages run in order: holding_review, discovery, catalyst_deep_research, committee, persistence, finalized.
- Stage outputs are stored before the next stage begins. Never infer stage completion from a request returning HTTP 200 alone.
- Never automatically replay a partially committed persistence stage. Require reconciliation of `investment_decisions`, `ag_research_watchlist`, and `transactions` before a manual resume.
- No automatic transactions. Do not modify real-money portfolio behavior.
- Resume requests must claim one stage atomically and reject concurrent workers; a stale lease requires explicit review before reclamation.

## Proposed SQL (review before running)

```sql
CREATE TABLE public.ag_cycle_stage_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.ag_daily_cycles(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id),
  strategy_era_id uuid NOT NULL REFERENCES public.portfolio_strategy_eras(id),
  stage text NOT NULL CHECK (stage IN (
    'holding_review', 'discovery', 'catalyst_deep_research',
    'committee', 'persistence', 'finalized'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'needs_manual_review'
  )),
  output jsonb,
  error_message text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ag_checkpoint_unique_cycle_stage UNIQUE (cycle_id, stage),
  CONSTRAINT ag_checkpoint_completed_has_output CHECK (status <> 'completed' OR output IS NOT NULL)
);

CREATE INDEX ag_cycle_stage_checkpoints_portfolio_idx
  ON public.ag_cycle_stage_checkpoints(portfolio_id, cycle_id);

ALTER TABLE public.ag_cycle_stage_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ag_cycle_stage_checkpoints FROM anon, authenticated;
GRANT ALL ON TABLE public.ag_cycle_stage_checkpoints TO service_role;
-- No direct authenticated table access: checkpoint output contains internal
-- recovery evidence. Expose only narrowly scoped SECURITY DEFINER claim,
-- completion, status and reconciliation RPCs after security review.
```

## Before activation

1. Review the SQL against live Supabase schemas, constraints, and migration conventions.
2. Add atomic claim/complete RPCs that verify cycle ownership and previous-stage completion.
3. Split the current monolithic endpoint into one-stage requests with a strict request budget.
4. Add deterministic decision reconciliation and persistence idempotency; mark ambiguous partial writes `needs_manual_review`.
5. Test interrupted discovery, rate limits, concurrent claims, stale claims, and interrupted persistence against an isolated paper test portfolio.
6. Enable runs only after preview tests pass and the user explicitly approves promotion.
