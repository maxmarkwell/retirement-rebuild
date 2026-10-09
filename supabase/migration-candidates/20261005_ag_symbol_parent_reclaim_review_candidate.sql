-- REVIEW CANDIDATE ONLY. Narrow recovery for expired AG symbol-fanout parent stages.
BEGIN;
CREATE OR REPLACE FUNCTION public.ag_reclaim_expired_symbol_parent_stage(p_cycle_id uuid,p_stage text)
RETURNS TABLE(checkpoint_id uuid,claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_cycle public.ag_daily_cycles%ROWTYPE;
 v_parent public.ag_cycle_stage_checkpoints%ROWTYPE;
 v_token uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_stage NOT IN ('catalyst_deep_research','committee') THEN RAISE EXCEPTION 'Invalid reclaimable AG stage'; END IF;
 SELECT * INTO v_cycle FROM public.ag_daily_cycles WHERE id=p_cycle_id AND user_id=auth.uid() AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cycle unavailable or not running'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.portfolios p JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
  WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid() AND p.type='paper_active' AND p.is_real_money=false
   AND e.id=v_cycle.strategy_era_id AND e.strategy_key='accelerated_growth' AND e.execution_mode='paper' AND e.ended_at IS NULL
 ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;
 SELECT * INTO v_parent FROM public.ag_cycle_stage_checkpoints
 WHERE cycle_id=p_cycle_id AND stage=p_stage FOR UPDATE;
 IF NOT FOUND OR v_parent.user_id<>auth.uid() OR v_parent.status<>'running'
    OR v_parent.lease_expires_at IS NULL OR v_parent.lease_expires_at>=now()
 THEN RAISE EXCEPTION 'Expired running AG symbol parent required'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.ag_cycle_symbol_checkpoints s
  WHERE s.cycle_id=p_cycle_id AND s.parent_stage=p_stage
    AND s.status IN ('running','failed','needs_manual_review')
 ) THEN RAISE EXCEPTION 'AG symbol child state requires manual reconciliation'; END IF;
 -- Completed children are immutable by trigger. Pending children are safe to retain.
 UPDATE public.ag_cycle_stage_checkpoints
 SET claim_token=v_token,lease_expires_at=now()+interval '6 minutes',
     attempt_count=attempt_count+1,started_at=now(),updated_at=now()
 WHERE id=v_parent.id AND status='running' AND lease_expires_at<now()
 RETURNING id INTO checkpoint_id;
 IF checkpoint_id IS NULL THEN RAISE EXCEPTION 'AG parent reclaim lost concurrency race'; END IF;
 claim_token:=v_token; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.ag_reclaim_expired_symbol_parent_stage(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ag_reclaim_expired_symbol_parent_stage(uuid,text) TO authenticated,service_role;
COMMIT;
