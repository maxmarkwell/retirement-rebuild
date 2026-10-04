-- PROPOSAL ONLY. Apply only after stage, ledger and decision drafts have been
-- approved and the live schema has been independently verified.
-- Persistence completion is atomic with an exact committed-ledger count.
-- Caller supplies expected ticker list, but payload identity still requires
-- separate canonical hash verification before this function is invoked.
-- RELEASE BLOCKER: p_expected_tickers is caller-controlled; this function
-- cannot establish that the caller supplied the COMPLETE planned batch.
-- Bind the expected manifest to a separately validated, immutable server-side
-- committee-stage artifact before enabling this RPC in any daily runner.
CREATE OR REPLACE FUNCTION public.ag_complete_persistence_stage(
  p_checkpoint_id uuid, p_claim_token uuid, p_expected_tickers text[]
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
        v_count integer;
BEGIN
 IF auth.uid() IS NULL OR p_expected_tickers IS NULL OR
    cardinality(p_expected_tickers) = 0 OR
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
 -- Count every row for the cycle, not just the caller's expected subset.
 SELECT count(*) INTO v_count FROM public.ag_cycle_decision_writes w
 WHERE w.cycle_id=v_checkpoint.cycle_id;
 IF v_count <> cardinality(p_expected_tickers) OR EXISTS (
   SELECT 1 FROM public.ag_cycle_decision_writes w
   WHERE w.cycle_id=v_checkpoint.cycle_id
     AND (w.user_id<>v_checkpoint.user_id OR
          w.portfolio_id<>v_checkpoint.portfolio_id OR
          w.strategy_era_id<>v_checkpoint.strategy_era_id OR
          w.status<>'committed' OR w.investment_decision_id IS NULL OR
          w.payload_hash !~ '^[a-f0-9]{64}$' OR
          NOT (w.ticker=ANY(p_expected_tickers)) OR
          NOT EXISTS (
            SELECT 1 FROM public.investment_decisions d
            WHERE d.id=w.investment_decision_id AND
              d.user_id=w.user_id AND d.portfolio_id=w.portfolio_id AND
              d.ticker=w.ticker AND d.status='active'
          ))
 ) THEN RETURN false; END IF;
 UPDATE public.ag_cycle_stage_checkpoints SET status='completed',
   claim_token=NULL, lease_expires_at=NULL, completed_at=now(),
   output=jsonb_build_object('ledger_coverage_verified',true,
      'expected_tickers',to_jsonb(p_expected_tickers)),
   updated_at=now() WHERE id=v_checkpoint.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_complete_persistence_stage(uuid,uuid,text[]) TO authenticated;
-- IMPORTANT: This proves ledger coverage and active decision linkage, NOT
-- canonical payload equality or manifest completeness. Do not enable
-- automatic recovery or active daily-runner integration on this basis.
