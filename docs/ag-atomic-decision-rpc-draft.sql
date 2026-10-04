-- DRAFT ONLY. DO NOT APPLY WITHOUT LIVE-SCHEMA AND SECURITY REVIEW.
-- Requires docs/ag-resumable-cycle-checkpoint-design.md checkpoint schema,
-- docs/ag-stage-claim-rpc-proposal.sql and
-- docs/ag-cycle-decision-ledger-proposal.sql first.
-- One invocation is one PostgreSQL transaction: any exception rolls back
-- supersession, insertion and ledger update together.

CREATE OR REPLACE FUNCTION public.ag_commit_cycle_decision(
  p_cycle_id uuid,
  p_claim_token uuid,
  p_ticker text,
  p_kind text,
  p_decision_type text,
  p_thesis text,
  p_confidence numeric,
  p_thesis_clock text,
  p_bull_case text,
  p_bear_case text,
  p_monitoring text,
  p_invalidation text,
  p_notes text,
  p_ag_thesis_valid boolean DEFAULT NULL,
  p_ag_liquidity_eligible boolean DEFAULT NULL,
  p_ag_evidence_version text DEFAULT NULL,
  p_ag_theme_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
  v_ledger public.ag_cycle_decision_writes%ROWTYPE;
  v_existing public.investment_decisions%ROWTYPE;
  v_existing_count integer;
  v_decision_id uuid;
  v_reuse boolean;
  v_payload_hash text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  -- Compute retry identity exclusively from validated RPC arguments inside
  -- PostgreSQL. The caller cannot spoof a digest or disagree on JSON encoding.
  -- Exact argument values (including optional NULLs) are immutable per key.
  v_payload_hash := encode(public.digest(
    convert_to(jsonb_build_array(p_cycle_id,p_ticker,p_kind,p_decision_type,
      p_thesis,p_confidence,p_thesis_clock,p_bull_case,p_bear_case,
      p_monitoring,p_invalidation,p_notes,p_ag_thesis_valid,
      p_ag_liquidity_eligible,p_ag_evidence_version,p_ag_theme_key)::text,'UTF8'),
    'sha256'),'hex');
  IF p_ticker IS NULL OR p_ticker !~ '^[A-Z][A-Z0-9.-]{0,14}$'
     OR p_kind IS NULL OR p_kind NOT IN ('holding_review','committee')
     OR p_decision_type IS NULL OR p_decision_type NOT IN ('buy','hold','sell','watch','avoid')
     OR p_thesis IS NULL OR length(trim(p_thesis)) = 0
     OR p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 100
  THEN RAISE EXCEPTION 'Invalid AG decision input'; END IF;
  IF (p_kind = 'holding_review' AND p_decision_type NOT IN ('hold','sell'))
     OR (p_kind = 'committee' AND p_decision_type NOT IN ('buy','watch','avoid'))
  THEN RAISE EXCEPTION 'Decision type incompatible with AG decision kind'; END IF;

  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id = p_cycle_id AND user_id = auth.uid() AND status = 'running'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AG cycle unavailable'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id = p.id
    WHERE p.id = v_cycle.portfolio_id AND p.user_id = auth.uid()
      AND p.type = 'paper_active' AND p.is_real_money = false
      AND e.id = v_cycle.strategy_era_id
      AND e.strategy_key = 'accelerated_growth'
      AND e.execution_mode = 'paper' AND e.ended_at IS NULL
  ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;

  SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
  WHERE cycle_id = p_cycle_id AND stage = 'persistence'
  FOR UPDATE;
  IF NOT FOUND OR v_checkpoint.status <> 'running'
     OR v_checkpoint.user_id IS DISTINCT FROM v_cycle.user_id
     OR v_checkpoint.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
     OR v_checkpoint.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
     OR v_checkpoint.claim_token IS DISTINCT FROM p_claim_token
     OR v_checkpoint.lease_expires_at IS NULL
     OR v_checkpoint.lease_expires_at <= now()
  THEN RAISE EXCEPTION 'Valid persistence stage claim required'; END IF;

  INSERT INTO public.ag_cycle_decision_writes
    (cycle_id,user_id,portfolio_id,strategy_era_id,ticker,decision_kind,payload_hash)
  VALUES
    (p_cycle_id,auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,
     p_ticker,p_kind,v_payload_hash)
  ON CONFLICT (cycle_id,ticker) DO NOTHING;
  SELECT * INTO v_ledger FROM public.ag_cycle_decision_writes
  WHERE cycle_id = p_cycle_id AND ticker = p_ticker FOR UPDATE;
  IF v_ledger.user_id IS DISTINCT FROM v_cycle.user_id
     OR v_ledger.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
     OR v_ledger.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
     OR v_ledger.payload_hash IS DISTINCT FROM v_payload_hash
     OR v_ledger.decision_kind IS DISTINCT FROM p_kind
  THEN RAISE EXCEPTION 'Conflicting payload for AG cycle ticker'; END IF;
  IF v_ledger.status = 'committed' THEN
    IF v_ledger.investment_decision_id IS NULL THEN
      RAISE EXCEPTION 'Committed AG ledger missing decision ID; manual reconciliation required';
    END IF;
    RETURN v_ledger.investment_decision_id;
  END IF;
  IF v_ledger.status <> 'pending' THEN
    RAISE EXCEPTION 'AG decision requires manual reconciliation';
  END IF;

  -- Serialize writes across different cycles targeting the same portfolio
  -- and ticker, not merely concurrent writes within one cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_cycle.portfolio_id::text || ':' || p_ticker, 0));

  -- Fencing: a later cycle that has already committed this ticker wins.
  -- Locking alone cannot prevent an older delayed cycle from overwriting it.
  IF EXISTS (
    SELECT 1 FROM public.ag_cycle_decision_writes newer
    JOIN public.ag_daily_cycles newer_cycle ON newer_cycle.id = newer.cycle_id
    WHERE newer.portfolio_id = v_cycle.portfolio_id
      AND newer.strategy_era_id = v_cycle.strategy_era_id
      AND newer.ticker = p_ticker AND newer.status = 'committed'
      AND newer.cycle_id <> p_cycle_id
      AND newer_cycle.cycle_date > v_cycle.cycle_date
  ) THEN
    RAISE EXCEPTION 'Newer AG cycle already committed this ticker; manual reconciliation required';
  END IF;

  SELECT count(*) INTO v_existing_count FROM public.investment_decisions
  WHERE portfolio_id = v_cycle.portfolio_id AND ticker = p_ticker
    AND source = 'ai_committee' AND status = 'active'
    AND created_at >= (
      SELECT inception_at FROM public.portfolio_strategy_eras
      WHERE id = v_cycle.strategy_era_id
    );
  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'Multiple active AG decisions require reconciliation';
  END IF;
  SELECT * INTO v_existing FROM public.investment_decisions
  WHERE portfolio_id = v_cycle.portfolio_id AND ticker = p_ticker
    AND source = 'ai_committee' AND status = 'active'
    AND created_at >= (
      SELECT inception_at FROM public.portfolio_strategy_eras
      WHERE id = v_cycle.strategy_era_id
    ) FOR UPDATE;

  -- Match the existing lifecycle rules: same type is reused only within
  -- its own decision family. Committee: buy/watch/avoid; holding: hold/sell.
  v_reuse := v_existing.id IS NOT NULL
    AND v_existing.decision_type = p_decision_type;
  IF v_reuse THEN
    v_decision_id := v_existing.id;
  ELSE
    IF v_existing.id IS NOT NULL THEN
      UPDATE public.investment_decisions SET status = 'superseded'
      WHERE id = v_existing.id AND status = 'active';
    END IF;
    INSERT INTO public.investment_decisions (
      user_id,portfolio_id,transaction_id,ticker,decision_type,decision_date,
      source,status,thesis,confidence_score,expected_holding_period,
      bull_case,bear_case,primary_risks,reassessment_conditions,exit_conditions,
      recommended_quantity,recommended_allocation,notes,
      ag_thesis_valid,ag_liquidity_eligible,ag_evidence_version,ag_theme_key
    ) VALUES (
      auth.uid(),v_cycle.portfolio_id,NULL,p_ticker,p_decision_type,now(),
      'ai_committee','active',p_thesis,p_confidence,p_thesis_clock,
      p_bull_case,p_bear_case,p_bear_case,p_monitoring,p_invalidation,
      NULL,NULL,p_notes,
      CASE WHEN p_kind = 'committee' THEN p_ag_thesis_valid ELSE NULL END,
      CASE WHEN p_kind = 'committee' THEN p_ag_liquidity_eligible ELSE NULL END,
      CASE WHEN p_kind = 'committee' THEN p_ag_evidence_version ELSE NULL END,
      CASE WHEN p_kind = 'committee' THEN p_ag_theme_key ELSE NULL END
    ) RETURNING id INTO v_decision_id;
  END IF;

  UPDATE public.ag_cycle_decision_writes
  SET status = 'committed',investment_decision_id = v_decision_id,committed_at = now()
  WHERE id = v_ledger.id;
  RETURN v_decision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_commit_cycle_decision(
  uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_commit_cycle_decision(
  uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) TO authenticated;

-- BLOCKERS BEFORE APPROVAL:
-- * Assumes pgcrypto digest() is installed in public; confirm extension schema.
-- * Hashes are computed server-side; test digest availability and deterministic
--   serialization using an isolated PostgreSQL instance.
-- * CRITICAL SCHEMA DRIFT: the committed create_investment_decisions migration
--   does NOT define investment_decisions.notes, although the current holding
--   pipeline and this draft INSERT use it. Inspect the isolated/live catalog
--   read-only; locate any later/manual ALTER before testing or approving.
--   Do not silently drop holding-review provenance or assume notes exists.
-- * Confirm actual decision_type enum/constraints and confidence scale.
-- * Verify committee ag_* field semantics and lifecycle parity against live
--   schema and tests, including REUSE of existing decisions.
-- * Verify stage lease behavior on long-running writes and timeout-after-commit.
-- * Same-day competing cycles need explicit reconciliation/fencing; never
--   infer chronological order from random UUIDs.
-- * Validate advisory lock key collision risk and lock ordering with other
--   portfolio writers; consider a dedicated per-portfolio lock table.
-- * Add tests for conflicting payload, duplicate concurrent call, rollback
--   on failed INSERT, expired claim, and cross-user/real-money access.
-- * Do not enable the API or apply this proposal until those are resolved.
