-- PROPOSAL ONLY. Read-only, server-side comparison of a frozen Committee
-- payload manifest against committed per-ticker ledger digests.
-- NOT WIRED TO COMPLETION OR THE ACTIVE RUNNER. A matching digest does not
-- prove the upstream Committee produced the manifest; independent upstream
-- capture/validation remains a release blocker.
--
-- Completed Committee output additionally needs decision_payloads:
-- [{"ticker":"XYZ","args":[cycle_uuid,ticker,kind,decision_type,thesis,
-- confidence,thesis_clock,bull_case,bear_case,monitoring,invalidation,
-- notes,ag_thesis_valid,ag_liquidity_eligible,ag_evidence_version,
-- ag_theme_key]}].
-- args MUST equal PostgreSQL jsonb_build_array of the typed RPC arguments
-- in precisely the order used by ag_commit_cycle_decision. The database,
-- not the client, calculates the digest from this stored canonical array.
CREATE OR REPLACE FUNCTION public.ag_verify_committee_payload_manifest(
  p_cycle_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_cycle public.ag_daily_cycles%ROWTYPE;
  v_manifest jsonb;
  v_tickers jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_cycle FROM public.ag_daily_cycles
  WHERE id=p_cycle_id AND user_id=auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.portfolios p
    JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
    WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid()
      AND p.type='paper_active' AND p.is_real_money=false
      AND e.id=v_cycle.strategy_era_id AND e.ended_at IS NULL
      AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper'
  ) THEN RETURN false; END IF;
  SELECT c.output->'decision_payloads',c.output->'persistence_tickers'
  INTO v_manifest,v_tickers FROM public.ag_cycle_stage_checkpoints c
  WHERE c.cycle_id=p_cycle_id AND c.stage='committee' AND c.status='completed'
    AND c.user_id=v_cycle.user_id AND c.portfolio_id=v_cycle.portfolio_id
    AND c.strategy_era_id=v_cycle.strategy_era_id;
  IF jsonb_typeof(v_manifest) IS DISTINCT FROM 'array'
     OR jsonb_typeof(v_tickers) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_manifest)=0
     OR jsonb_array_length(v_manifest)<>jsonb_array_length(v_tickers)
  THEN RETURN false; END IF;
  -- Reject malformed, duplicate, missing or out-of-scope entries. A
  -- manifest cannot silently omit a ledger row or duplicate one ticker.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE jsonb_typeof(m.entry) IS DISTINCT FROM 'object'
       OR jsonb_typeof(m.entry->'ticker') IS DISTINCT FROM 'string'
       OR (m.entry->>'ticker') !~ '^[A-Z][A-Z0-9.-]{0,14}$'
       OR jsonb_typeof(m.entry->'args') IS DISTINCT FROM 'array'
       OR jsonb_array_length(CASE WHEN jsonb_typeof(m.entry->'args')='array'
          THEN m.entry->'args' ELSE '[]'::jsonb END)<>16
       OR NOT (v_tickers ? (m.entry->>'ticker'))
       OR (m.entry->'args'->>0) IS DISTINCT FROM p_cycle_id::text
       OR (m.entry->'args'->>1) IS DISTINCT FROM (m.entry->>'ticker')
       OR (m.entry->'args'->>2) IS DISTINCT FROM 'committee'
  ) THEN RETURN false; END IF;
  SELECT count(DISTINCT m.entry->>'ticker') INTO v_count
  FROM jsonb_array_elements(v_manifest) AS m(entry);
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes
  WHERE cycle_id=p_cycle_id;
  IF v_count<>jsonb_array_length(v_manifest) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_manifest) AS m(entry)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.ag_cycle_decision_writes w
      JOIN public.investment_decisions d ON d.id=w.investment_decision_id
      WHERE w.cycle_id=p_cycle_id AND w.ticker=m.entry->>'ticker'
        AND w.user_id=v_cycle.user_id
        AND w.portfolio_id=v_cycle.portfolio_id
        AND w.strategy_era_id=v_cycle.strategy_era_id
        AND w.decision_kind='committee' AND w.status='committed'
        AND w.payload_hash=encode(public.digest(
          convert_to((m.entry->'args')::text,'UTF8'),'sha256'),'hex')
        AND d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id
        AND d.ticker=w.ticker AND d.status='active'
        AND d.source='ai_committee'
    )
  ) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_verify_committee_payload_manifest(uuid)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_verify_committee_payload_manifest(uuid)
 TO authenticated;
-- RELEASE BLOCKERS: upstream Committee provenance and completeness,
-- typed argument normalization, immutable manifest capture at completion,
-- actual-schema review, holding-review parity, and integration into the
-- same locked transaction as persistence completion.
