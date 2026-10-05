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
    'source_row_id','17171717-1717-4717-8717-171717171717','action','supersede_committee'),
  jsonb_build_object('stream','research_watch','symbol','ROLLBACK',
    'source_row_id',null,'action','upsert_watch')
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

-- A failure after target mutation must roll back both target and ledger.
CREATE FUNCTION public.ag_test_fail_watch_commit() RETURNS trigger LANGUAGE plpgsql AS $agtest$
BEGIN
 IF NEW.ticker='ROLLBACK' AND NEW.status='committed' THEN
  RAISE EXCEPTION 'forced watch ledger failure';
 END IF;
 RETURN NEW;
END $agtest$;
CREATE TRIGGER ag_test_fail_watch_commit
 BEFORE UPDATE ON public.ag_cycle_watch_writes
 FOR EACH ROW EXECUTE FUNCTION public.ag_test_fail_watch_commit();
DO $agtest$ BEGIN
 BEGIN
  PERFORM public.ag_commit_watch_operation(
   '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
   'research_watch','ROLLBACK','upsert_watch',null,null,'Rollback Co',0.5,
   'Rollback thesis',ARRAY['Q'],'short',ARRAY['I'],'model','v1',false);
  RAISE EXCEPTION 'Forced rollback operation unexpectedly committed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Forced rollback operation unexpectedly committed' THEN RAISE; END IF;
  IF SQLERRM<>'forced watch ledger failure' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.ag_research_watchlist WHERE ticker='ROLLBACK')
    OR EXISTS (SELECT 1 FROM public.ag_cycle_watch_writes
               WHERE cycle_id='15151515-1515-4515-8515-151515151515'
                 AND ticker='ROLLBACK')
 THEN RAISE EXCEPTION 'Forced watch failure left partial state'; END IF;
END $agtest$;
DROP TRIGGER ag_test_fail_watch_commit ON public.ag_cycle_watch_writes;
DROP FUNCTION public.ag_test_fail_watch_commit();

-- Cross-owner caller cannot reuse a valid claim or frozen manifest.
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $agtest$ BEGIN
 BEGIN
  PERFORM public.ag_commit_watch_operation(
   '15151515-1515-4515-8515-151515151515','18181818-1818-4818-8818-181818181818',
   'research_watch','NEWSTOP','resolve_research',null,'STOP',
   null,null,null,null,null,null,null,null,false);
  RAISE EXCEPTION 'Cross-owner watch operation accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Cross-owner watch operation accepted' THEN RAISE; END IF;
  IF SQLERRM<>'AG cycle unavailable' THEN RAISE; END IF;
 END;
END $agtest$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

-- A delayed older cycle cannot overwrite a newer committed watch operation.
INSERT INTO public.ag_daily_cycles VALUES
 ('19191919-1919-4919-8919-191919191919',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',current_date+13,'running'),
 ('20202020-2020-4020-8020-202020202020',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',current_date+14,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 '19191919-1919-4919-8919-191919191919',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','catalyst_deep_research','completed',
 '{"watchlist_intents":[{"stream":"research_watch","symbol":"FENCED","source_row_id":null,"action":"resolve_research"}]}'::jsonb);
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at
) VALUES (
 '19191919-1919-4919-8919-191919191919',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','persistence','running',
 '21212121-2121-4121-8121-212121212121',now()+interval '10 minutes');
INSERT INTO public.ag_cycle_watch_writes(
 cycle_id,user_id,portfolio_id,strategy_era_id,stream,ticker,action,
 payload_hash,status,effect,affected_row_id,committed_at
) VALUES (
 '20202020-2020-4020-8020-202020202020',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 'research_watch','FENCED','resolve_research',repeat('e',64),
 'committed','noop',null,now());
DO $agtest$ BEGIN
 BEGIN
  PERFORM public.ag_commit_watch_operation(
   '19191919-1919-4919-8919-191919191919','21212121-2121-4121-8121-212121212121',
   'research_watch','FENCED','resolve_research',null,'STOP',
   null,null,null,null,null,null,null,null,false);
  RAISE EXCEPTION 'Older watch cycle bypassed newer-cycle fence';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Older watch cycle bypassed newer-cycle fence' THEN RAISE; END IF;
  IF SQLERRM<>'Newer AG cycle already committed this watch operation' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.ag_cycle_watch_writes
   WHERE cycle_id='19191919-1919-4919-8919-191919191919' AND ticker='FENCED')
 THEN RAISE EXCEPTION 'Fenced older cycle left pending ledger state'; END IF;
END $agtest$;


-- Simulate timeout-after-commit: ignore the original RPC return value and
-- recover only by read-only ledger + actual target-row postconditions.
DO $agtest$
BEGIN
 IF NOT public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
  'New watch thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
  'model','v1',false)
 THEN RAISE EXCEPTION 'Committed watch upsert postcondition was not verified'; END IF;

 IF NOT public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','NEWSTOP','resolve_research',null,'STOP',
  null,null,null,null,null,null,null,null,false)
 THEN RAISE EXCEPTION 'Committed watch no-op postcondition was not verified'; END IF;

 IF NOT public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','OLDWATCH','resolve_quantitative',
  '16161616-1616-4616-8616-161616161616','REJECT',
  null,null,null,null,null,null,null,null,false)
 THEN RAISE EXCEPTION 'Committed watch resolution postcondition was not verified'; END IF;

 IF NOT public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'committee_watch','CWATCH','supersede_committee',
  '17171717-1717-4717-8717-171717171717','REJECT',
  null,null,null,null,null,null,null,null,false)
 THEN RAISE EXCEPTION 'Committed Committee supersession postcondition was not verified'; END IF;

 -- Same ledger identity with altered frozen payload must not verify.
 IF public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
  'Altered thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
  'model','v1',false)
 THEN RAISE EXCEPTION 'Altered frozen payload verified against committed ledger'; END IF;
END $agtest$;

-- Verification is owner-scoped even though it is read-only.
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $agtest$ BEGIN
 IF public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','NEWSTOP','resolve_research',null,'STOP',
  null,null,null,null,null,null,null,null,false)
 THEN RAISE EXCEPTION 'Cross-owner postcondition verification succeeded'; END IF;
END $agtest$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

-- A committed ledger row alone is insufficient: actual target-row tampering
-- after commit must make recovery fail closed.
UPDATE public.ag_research_watchlist SET thesis='tampered after commit'
WHERE ticker='NEWWATCH' AND resolved_at IS NULL;
DO $agtest$ BEGIN
 IF public.ag_verify_watch_operation_postcondition(
  '15151515-1515-4515-8515-151515151515',
  'research_watch','NEWWATCH','upsert_watch',null,null,'New Co',0.72,
  'New watch thesis',ARRAY['Question'],'medium',ARRAY['Invalidation'],
  'model','v1',false)
 THEN RAISE EXCEPTION 'Tampered target row passed postcondition verification'; END IF;
END $agtest$;
