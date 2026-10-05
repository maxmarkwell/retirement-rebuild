-- DRAFT ONLY. DO NOT APPLY WITHOUT LIVE-SCHEMA / SECURITY REVIEW.
-- One operation per transaction. Same-cycle identical retry returns the ledger
-- id; conflicting retry, stale source identity, newer-cycle evidence, or an
-- ambiguous prior state fails closed.
CREATE OR REPLACE FUNCTION public.ag_commit_watch_operation(
 p_cycle_id uuid,p_claim_token uuid,p_stream text,p_ticker text,p_action text,
 p_source_row_id uuid,p_resolution text,p_company_name text,p_confidence numeric,
 p_thesis text,p_unresolved_questions text[],p_thesis_clock text,
 p_invalidation text[],p_model text,p_prompt_version text,
 p_prior_watch_reassessed boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
 v_cycle public.ag_daily_cycles%ROWTYPE;
 v_checkpoint public.ag_cycle_stage_checkpoints%ROWTYPE;
 v_ledger public.ag_cycle_watch_writes%ROWTYPE;
 v_watch public.ag_research_watchlist%ROWTYPE;
 v_decision public.investment_decisions%ROWTYPE;
 v_payload_hash text; v_affected uuid; v_effect text; v_now timestamptz:=now();
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_ticker IS NULL OR p_ticker !~ '^[A-Z][A-Z0-9.-]{0,14}$'
   OR p_stream NOT IN ('research_watch','committee_watch')
   OR p_action NOT IN ('upsert_watch','resolve_research','resolve_quantitative','supersede_committee')
   OR (p_stream='research_watch' AND p_action NOT IN ('upsert_watch','resolve_research','resolve_quantitative'))
   OR (p_stream='committee_watch' AND p_action<>'supersede_committee')
   OR (p_action IN ('resolve_quantitative','supersede_committee') AND p_source_row_id IS NULL)
 THEN RAISE EXCEPTION 'Invalid AG watch operation'; END IF;
 IF p_action='upsert_watch' AND (
   p_resolution IS NOT NULL OR p_confidence IS NULL OR p_confidence<0 OR p_confidence>1
   OR p_thesis IS NULL OR length(trim(p_thesis))=0
   OR p_unresolved_questions IS NULL OR p_thesis_clock IS NULL
   OR length(trim(p_thesis_clock))=0 OR p_invalidation IS NULL
   OR p_model IS NULL OR length(trim(p_model))=0
   OR p_prompt_version IS NULL OR length(trim(p_prompt_version))=0
   OR p_prior_watch_reassessed IS DISTINCT FROM (p_source_row_id IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Invalid AG watch upsert payload'; END IF;
 IF p_action='resolve_research' AND p_resolution NOT IN ('PROCEED','STOP')
 THEN RAISE EXCEPTION 'Invalid AG research resolution'; END IF;
 IF p_action IN ('resolve_quantitative','supersede_committee')
    AND p_resolution NOT IN ('REVIEW','REJECT','INSUFFICIENT_DATA')
 THEN RAISE EXCEPTION 'Invalid AG quantitative resolution'; END IF;

 SELECT * INTO v_cycle FROM public.ag_daily_cycles
 WHERE id=p_cycle_id AND user_id=auth.uid() AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AG cycle unavailable'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.portfolios p JOIN public.portfolio_strategy_eras e ON e.portfolio_id=p.id
  WHERE p.id=v_cycle.portfolio_id AND p.user_id=auth.uid()
   AND p.type='paper_active' AND p.is_real_money=false
   AND e.id=v_cycle.strategy_era_id AND e.strategy_key='accelerated_growth'
   AND e.execution_mode='paper' AND e.ended_at IS NULL
 ) THEN RAISE EXCEPTION 'Active paper AG portfolio and era required'; END IF;
 SELECT * INTO v_checkpoint FROM public.ag_cycle_stage_checkpoints
 WHERE cycle_id=p_cycle_id AND stage='persistence' FOR UPDATE;
 IF NOT FOUND OR v_checkpoint.status<>'running'
   OR v_checkpoint.user_id IS DISTINCT FROM v_cycle.user_id
   OR v_checkpoint.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
   OR v_checkpoint.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
   OR v_checkpoint.claim_token IS DISTINCT FROM p_claim_token
   OR v_checkpoint.lease_expires_at IS NULL OR v_checkpoint.lease_expires_at<=now()
 THEN RAISE EXCEPTION 'Valid persistence stage claim required'; END IF;

 -- Require the exact operation identity to have been frozen upstream. This is
 -- a membership fence only; full watch payload provenance still needs a
 -- dedicated verifier before release.
 IF NOT EXISTS (
  SELECT 1 FROM public.ag_cycle_stage_checkpoints c,
       LATERAL jsonb_array_elements(c.output->'watchlist_intents') AS intent(entry)
  WHERE c.cycle_id=p_cycle_id AND c.stage='catalyst_deep_research'
   AND c.status='completed' AND c.user_id=v_cycle.user_id
   AND c.portfolio_id=v_cycle.portfolio_id AND c.strategy_era_id=v_cycle.strategy_era_id
   AND jsonb_typeof(c.output->'watchlist_intents')='array'
   AND entry->>'stream'=p_stream AND entry->>'symbol'=p_ticker AND entry->>'action'=p_action
   AND ((p_source_row_id IS NULL AND entry->'source_row_id'='null'::jsonb)
     OR entry->>'source_row_id'=p_source_row_id::text)
 ) THEN RAISE EXCEPTION 'Watch operation absent from completed research manifest'; END IF;

 v_payload_hash:=encode(public.digest(convert_to(jsonb_build_array(
  p_cycle_id,p_stream,p_ticker,p_action,p_source_row_id,p_resolution,
  p_company_name,p_confidence,p_thesis,p_unresolved_questions,p_thesis_clock,
  p_invalidation,p_model,p_prompt_version,p_prior_watch_reassessed)::text,'UTF8'),'sha256'),'hex');
 INSERT INTO public.ag_cycle_watch_writes(
  cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
  source_row_id,payload_hash
 ) VALUES (
  p_cycle_id,auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,p_stream,
  p_ticker,p_action,p_source_row_id,v_payload_hash
 ) ON CONFLICT (cycle_id,stream,ticker) DO NOTHING;
 SELECT * INTO v_ledger FROM public.ag_cycle_watch_writes
 WHERE cycle_id=p_cycle_id AND stream=p_stream AND ticker=p_ticker FOR UPDATE;
 IF v_ledger.user_id IS DISTINCT FROM v_cycle.user_id
   OR v_ledger.portfolio_id IS DISTINCT FROM v_cycle.portfolio_id
   OR v_ledger.strategy_era_id IS DISTINCT FROM v_cycle.strategy_era_id
   OR v_ledger.action IS DISTINCT FROM p_action
   OR v_ledger.source_row_id IS DISTINCT FROM p_source_row_id
   OR v_ledger.payload_hash IS DISTINCT FROM v_payload_hash
 THEN RAISE EXCEPTION 'Conflicting payload for AG watch operation'; END IF;
 IF v_ledger.status='committed' THEN RETURN v_ledger.id; END IF;
 IF v_ledger.status<>'pending' THEN RAISE EXCEPTION 'AG watch operation requires manual reconciliation'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(
  v_cycle.portfolio_id::text||':'||p_stream||':'||p_ticker,0));
 IF EXISTS (
  SELECT 1 FROM public.ag_cycle_watch_writes newer
  JOIN public.ag_daily_cycles d ON d.id=newer.cycle_id
  WHERE newer.portfolio_id=v_cycle.portfolio_id
   AND newer.strategy_era_id=v_cycle.strategy_era_id
   AND newer.stream=p_stream AND newer.ticker=p_ticker
   AND newer.status='committed' AND newer.cycle_id<>p_cycle_id
   AND d.cycle_date>v_cycle.cycle_date
 ) THEN RAISE EXCEPTION 'Newer AG cycle already committed this watch operation'; END IF;

 IF p_stream='research_watch' THEN
  IF p_source_row_id IS NOT NULL THEN
   SELECT * INTO v_watch FROM public.ag_research_watchlist
   WHERE id=p_source_row_id AND user_id=auth.uid()
    AND portfolio_id=v_cycle.portfolio_id AND strategy_era_id=v_cycle.strategy_era_id
    AND ticker=p_ticker FOR UPDATE;
   IF NOT FOUND OR v_watch.resolved_at IS NOT NULL
   THEN RAISE EXCEPTION 'Frozen research watch source row unavailable'; END IF;
  ELSIF EXISTS (
   SELECT 1 FROM public.ag_research_watchlist
   WHERE user_id=auth.uid() AND portfolio_id=v_cycle.portfolio_id
    AND strategy_era_id=v_cycle.strategy_era_id AND ticker=p_ticker
    AND resolved_at IS NULL
  ) THEN RAISE EXCEPTION 'Open research watch exists but frozen source identity is absent'; END IF;

  IF p_action='upsert_watch' THEN
   IF p_source_row_id IS NULL THEN
    INSERT INTO public.ag_research_watchlist(
     user_id,portfolio_id,strategy_era_id,ticker,company_name,research_status,
     confidence,thesis,unresolved_questions,thesis_clock,invalidation,model,
     prompt_version,first_seen_at,last_seen_at,created_at,updated_at
    ) VALUES (
     auth.uid(),v_cycle.portfolio_id,v_cycle.strategy_era_id,p_ticker,p_company_name,
     'WATCH',p_confidence,p_thesis,p_unresolved_questions,p_thesis_clock,
     p_invalidation,p_model,p_prompt_version,v_now,v_now,v_now,v_now
    ) RETURNING id INTO v_affected;
   ELSE
    UPDATE public.ag_research_watchlist SET
     company_name=COALESCE(p_company_name,company_name),research_status='WATCH',
     confidence=p_confidence,thesis=p_thesis,
     unresolved_questions=p_unresolved_questions,thesis_clock=p_thesis_clock,
     invalidation=p_invalidation,model=p_model,prompt_version=p_prompt_version,
     last_seen_at=v_now,updated_at=v_now
    WHERE id=p_source_row_id RETURNING id INTO v_affected;
   END IF;
   v_effect:='applied';
  ELSIF p_source_row_id IS NULL THEN
   -- New PROCEED/STOP candidates had no prior research-watch row in the legacy
   -- flow. Record that intentional no-op durably.
   v_effect:='noop'; v_affected:=NULL;
  ELSE
   UPDATE public.ag_research_watchlist SET resolved_at=v_now,
    resolution=CASE WHEN p_action='resolve_quantitative'
      THEN 'QUANTITATIVE_'||p_resolution ELSE p_resolution END,
    last_seen_at=v_now,updated_at=v_now
   WHERE id=p_source_row_id RETURNING id INTO v_affected;
   IF v_affected IS NULL THEN RAISE EXCEPTION 'Frozen research watch update failed'; END IF;
   v_effect:='applied';
  END IF;
 ELSE
  SELECT * INTO v_decision FROM public.investment_decisions
  WHERE id=p_source_row_id AND user_id=auth.uid()
   AND portfolio_id=v_cycle.portfolio_id AND ticker=p_ticker
   AND source='ai_committee' AND decision_type='watch' AND status='active'
   AND created_at >= (SELECT inception_at FROM public.portfolio_strategy_eras
                      WHERE id=v_cycle.strategy_era_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Frozen Committee WATCH source row unavailable'; END IF;
  UPDATE public.investment_decisions SET status='superseded'
  WHERE id=p_source_row_id AND status='active' RETURNING id INTO v_affected;
  IF v_affected IS NULL THEN RAISE EXCEPTION 'Frozen Committee WATCH supersession failed'; END IF;
  v_effect:='applied';
 END IF;

 UPDATE public.ag_cycle_watch_writes SET status='committed',effect=v_effect,
  affected_row_id=v_affected,committed_at=v_now WHERE id=v_ledger.id;
 RETURN v_ledger.id;
END;
$$;
REVOKE ALL ON FUNCTION public.ag_commit_watch_operation(
 uuid,uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ag_commit_watch_operation(
 uuid,uuid,text,text,text,uuid,text,text,numeric,text,text[],text,text[],text,text,boolean
) TO authenticated;
