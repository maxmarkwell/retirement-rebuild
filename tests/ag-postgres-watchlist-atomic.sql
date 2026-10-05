-- Disposable transactional watchlist RPC regressions.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.ag_daily_cycles VALUES (
 '15151515-1515-4515-8515-151515151515',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+12,'running');
INSERT INTO public.ag_research_watchlist(
 id,user_id,portfolio_id,strategy_era_id,ticker,research_status,confidence,
 thesis,model,prompt_version
) VALUES (
 '16161616-1616-4616-8616-161616161616',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 'OLDWATCH','WATCH',0.6,'Old thesis','old-model','old-v1');
INSERT INTO public.investment_decisions(
 id,user_id,portfolio_id,ticker,decision_type,source,status,thesis
) VALUES (
 '17171717-1717-4717-8717-171717171717',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 'CWATCH','watch','ai_committee','active','Old Committee watch');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 '15151515-1515-4515-8515-151515151515',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','catalyst_deep_research','completed',
 jsonb_build_object('watchlist_intents',jsonb_build_array(
  jsonb_build_object('stream','research_watch','symbol','NEWWATCH',
    'source_row_id',null,'action','upsert_watch'),
  jsonb_build_object('stream','research_watch','symbol','NEWSTOP',
    'source_row_id',null,'action','resolve_research'),
  jsonb_build_object('stream','research_watch','symbol','OLDWATCH',
    'source_row_id','16161616-1616-4616-8616-161616161616','action','resolve_quantitative'),
  jsonb_build_object('stream','committee_watch','symbol','CWATCH',
    'source_row_id','17171717-1717-4717-8717-171717171717','action','supersede_committee')
  )));
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at
) VALUES (
 '15151515-1515-4515-8515-151515151515',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','persistence','running',
 '18181818-1818-4818-8818-181818181818',now()+interval '10 minutes');
DO $agtest$
DECLARE first_ledger uuid; retry_ledger uuid; noop_ledger uuid;
BEGIN
 first_ledger:=public.ag_commit_watch_operation(
  '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
  'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
  'New watch thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
  'model','v1',false);
 retry_ledger:=public.ag_commit_watch_operation(
  '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
  'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
  'New watch thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
  'model','v1',false);
 IF retry_ledger IS DISTINCT FROM first_ledger THEN
  RAISE EXCEPTION 'Watch upsert retry was not idempotent'; END IF;
 IF (SELECT count(*) FROM public.ag_research_watchlist
     WHERE ticker='NEWWATCH' AND resolved_at IS NULL)<>1
 THEN RAISE EXCEPTION 'Watch upsert did not create exactly one open row'; END IF;
 BEGIN
  PERFORM public.ag_commit_watch_operation(
   '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
   'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
   'Changed thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
   'model','v1',false);
  RAISE EXCEPTION 'Conflicting watch retry accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Conflicting watch retry accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Conflicting payload for AG watch operation' THEN RAISE; END IF;
 END;
 noop_ledger:=public.ag_commit_watch_operation(
  '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
  'research_watch','NEWSTOP','resolve_research',null,'STOP',
  null,null,null,null,null,null,null,null,false);
 IF NOT EXISTS (SELECT 1 FROM public.ag_cycle_watch_writes
   WHERE id=noop_ledger AND status='committed' AND effect='noop'
     AND affected_row_id IS NULL)
 THEN RAISE EXCEPTION 'Intentional new-candidate no-op not recorded'; END IF;
 PERFORM public.ag_commit_watch_operation(
  '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
  'research_watch','OLDWATCH','resolve_quantitative',
  '16161616-1616-4616-8616-161616161616','REJECT',
  null,null,null,null,null,null,null,null,false);
 IF (SELECT resolution FROM public.ag_research_watchlist
     WHERE id='16161616-1616-4616-8616-161616161616')<>'QUANTITATIVE_REJECT'
 THEN RAISE EXCEPTION 'Frozen research watch resolution not applied'; END IF;
 PERFORM public.ag_commit_watch_operation(
  '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
  'committee_watch','CWATCH','supersede_committee',
  '17171717-1717-4717-8717-171717171717','REJECT',
  null,null,null,null,null,null,null,null,false);
 IF (SELECT status FROM public.investment_decisions
     WHERE id='17171717-1717-4717-8717-171717171717')<>'superseded'
 THEN RAISE EXCEPTION 'Frozen Committee WATCH not superseded'; END IF;
 BEGIN
  PERFORM public.ag_commit_watch_operation(
   '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
   'research_watch','ABSENT','resolve_research',null,'STOP',
   null,null,null,null,null,null,null,null,false);
  RAISE EXCEPTION 'Operation absent from frozen manifest accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Operation absent from frozen manifest accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Watch operation absent from completed research manifest' THEN RAISE; END IF;
 END;
END $agtest$;
