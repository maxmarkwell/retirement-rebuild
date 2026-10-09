-- PROPOSAL ONLY. Apply only after stage, ledger and decision drafts have been
-- approved and the live schema has been independently verified.
-- Persistence completion is atomic with exact combined committed-ledger
-- coverage. Caller supplies the expected union; completion verifies both
-- frozen Committee and holding payload hashes and linked decision fields
-- while holding the persistence checkpoint lock. Upstream provenance and
-- watchlist recovery is verified from the frozen deep-research manifest before completion.
-- RELEASE BLOCKER: Committee checkpoint output must be independently validated
-- and immutable after completion. Matching its manifest is necessary but not
-- sufficient to prove the Committee planned the complete decision batch.
CREATE OR REPLACE FUNCTION public.ag_complete_persistence_stage(
  p_checkpoint_id uuid, p_claim_token uuid, p_expected_tickers text[]
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
        v_count integer;
        v_manifest jsonb;
        v_holding_manifest jsonb;
        v_committee_count integer;
        v_holding_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_expected_tickers IS NULL OR
    EXISTS (SELECT 1 FROM unnest(p_expected_tickers) t
            WHERE t IS NULL OR t !~ '^[A-Z][A-Z0-9.-]{0,14}$') OR
    cardinality(p_expected_tickers) <>
      (SELECT count(DISTINCT t) FROM unnest(p_expected_tickers) t)
 THEN RAISE EXCEPTION 'Valid unique expected tickers required'; END IF;

 SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
 WHERE id=p_checkpoint_id AND user_id=auth.uid() AND stage='persistence'
   AND status='running' AND claim_token=p_claim_token
   AND lease_expires_at > now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.ag_daily_cycles d
   JOIN public.portfolios p ON p.id=d.portfolio_id
   JOIN public.portfolio_strategy_eras e ON e.id=d.strategy_era_id
   WHERE d.id=v_checkpoint.cycle_id AND d.user_id=auth.uid()
     AND d.status='running' AND p.id=v_checkpoint.portfolio_id
     AND p.user_id=auth.uid() AND p.type='paper_active'
     AND p.is_real_money=false AND e.id=v_checkpoint.strategy_era_id
     AND e.portfolio_id=p.id AND e.ended_at IS NULL
     AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper'
 ) THEN RETURN false; END IF;
 -- The expected union must include every completed Committee ticker.
 -- The source manifests must be validated and frozen at stage completion;
 -- membership alone is not proof that upstream output is complete.
 SELECT c.output->'persistence_tickers' INTO v_manifest
 FROM public.ag_cycle_stage_checkpoints c
 WHERE c.cycle_id=v_checkpoint.cycle_id AND c.stage='committee'
   AND c.status='completed' AND c.user_id=v_checkpoint.user_id
   AND c.portfolio_id=v_checkpoint.portfolio_id
   AND c.strategy_era_id=v_checkpoint.strategy_era_id;
 IF v_manifest IS NULL OR jsonb_typeof(v_manifest)<>'array' OR
    jsonb_array_length(v_manifest)>cardinality(p_expected_tickers) OR
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_manifest) element
      WHERE jsonb_typeof(element)<>'string' OR
        NOT ((element #>> '{}')=ANY(p_expected_tickers))
    )
 THEN RETURN false; END IF;
 -- A complete AG cycle must also have an explicit completed holding stage,
 -- including the legitimate empty batch. The union is disjoint and exact.
 SELECT h.output->'persistence_tickers' INTO v_holding_manifest
 FROM public.ag_cycle_stage_checkpoints h
 WHERE h.cycle_id=v_checkpoint.cycle_id AND h.stage='holding_review'
   AND h.status='completed' AND h.user_id=v_checkpoint.user_id
   AND h.portfolio_id=v_checkpoint.portfolio_id
   AND h.strategy_era_id=v_checkpoint.strategy_era_id;
 IF jsonb_typeof(v_holding_manifest) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_manifest)+jsonb_array_length(v_holding_manifest)
       <> cardinality(p_expected_tickers)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_holding_manifest) element
      WHERE jsonb_typeof(element)<>'string'
        OR NOT ((element #>> '{}')=ANY(p_expected_tickers))
        OR v_manifest ? (element #>> '{}')
    )
 THEN RETURN false; END IF;
 SELECT count(*) INTO v_committee_count FROM public.ag_cycle_decision_writes
 WHERE cycle_id=v_checkpoint.cycle_id AND decision_kind='committee';
 SELECT count(*) INTO v_holding_count FROM public.ag_cycle_decision_writes
 WHERE cycle_id=v_checkpoint.cycle_id AND decision_kind='holding_review';
 IF v_committee_count<>jsonb_array_length(v_manifest)
    OR v_holding_count<>jsonb_array_length(v_holding_manifest)
 THEN RETURN false; END IF;
 -- Count every row for the cycle, not just the caller's expected subset.
 SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes w
 WHERE w.cycle_id=v_checkpoint.cycle_id;
 IF v_count <> cardinality(p_expected_tickers) OR EXISTS (
   SELECT 1 FROM public.ag_cycle_decision_writes w
   WHERE w.cycle_id=v_checkpoint.cycle_id
     AND (w.user_id<>v_checkpoint.user_id OR
          w.portfolio_id<>v_checkpoint.portfolio_id OR
          w.strategy_era_id<>v_checkpoint.strategy_era_id OR
          w.decision_kind NOT IN ('committee','holding_review') OR
          w.status<>'committed' OR w.investment_decision_id IS NULL OR
          w.payload_hash !~ '^[a-f0-9]{64}$' OR
          NOT (w.ticker=ANY(p_expected_tickers)) OR
          NOT EXISTS (
            SELECT 1 FROM public.investment_decisions d
            WHERE d.id=w.investment_decision_id AND
              d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id AND
              d.ticker=w.ticker AND d.status='active' AND
              d.source='ai_committee' AND d.created_at >= (
                SELECT e.inception_at FROM public.portfolio_strategy_eras e
                WHERE e.id=w.strategy_era_id AND e.portfolio_id=w.portfolio_id
              )
          ))
 ) THEN RETURN false; END IF;
 -- Both verifiers check full frozen typed argument arrays against the
 -- server-derived ledger digests and their linked decision content.
 -- All decision RPCs acquire this same persistence checkpoint FOR UPDATE,
 -- preventing writes from racing between verification and completion.
 IF NOT public.ag_verify_committee_payload_manifest(v_checkpoint.cycle_id)
    OR NOT public.ag_verify_holding_payload_manifest(v_checkpoint.cycle_id)
    OR NOT public.ag_verify_cycle_watch_manifest(v_checkpoint.cycle_id)
 THEN RETURN false; END IF;
 UPDATE public.ag_cycle_stage_checkpoints SET status='completed',
   claim_token=NULL, lease_expires_at=NULL, completed_at=now(),
   output=jsonb_build_object('ledger_coverage_verified',true,
      'committee_payload_hashes_verified',true,
      'holding_payload_hashes_verified',true,
      'watch_postconditions_verified',true,
      'expected_tickers',to_jsonb(p_expected_tickers)),
   updated_at=now() WHERE id=v_checkpoint.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) TO authenticated;
-- The combined manifest check covers both decision kinds and an explicit
-- empty holding stage. It does NOT prove upstream model provenance or actual-schema compatibility. Do not enable
-- automatic recovery or active daily-runner integration on this basis.
