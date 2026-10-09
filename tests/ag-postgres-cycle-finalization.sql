-- Disposable DB only: finalization must require completed, verified persistence.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

-- Independent zero-decision/zero-watch cycle avoids coupling to earlier test mutations.
INSERT INTO public.ag_daily_cycles VALUES (
 'fafafafa-fafa-4afa-8afa-fafafafafafa',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+30,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES
 ('fafafafa-fafa-4afa-8afa-fafafafafafa','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  'holding_review','completed','{"persistence_tickers":[],"decision_payloads":[]}'::jsonb),
 ('fafafafa-fafa-4afa-8afa-fafafafafafa','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  'discovery','completed','{}'::jsonb),
 ('fafafafa-fafa-4afa-8afa-fafafafafafa','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  'catalyst_deep_research','completed','{"watchlist_intents":[]}'::jsonb),
 ('fafafafa-fafa-4afa-8afa-fafafafafafa','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  'committee','completed','{"persistence_tickers":[],"decision_payloads":[]}'::jsonb);

DO $agfinalize$
DECLARE pcp uuid; ptoken uuid; cp uuid; token uuid; ok boolean;
BEGIN
 SELECT checkpoint_id,claim_token INTO pcp,ptoken
 FROM public.ag_claim_cycle_stage('fafafafa-fafa-4afa-8afa-fafafafafafa','persistence');
 ok:=public.ag_complete_persistence_stage(pcp,ptoken,ARRAY[]::text[]);
 IF NOT ok THEN RAISE EXCEPTION 'Finalization fixture persistence did not complete'; END IF;

 SELECT checkpoint_id,claim_token INTO cp,token
 FROM public.ag_claim_cycle_stage('fafafafa-fafa-4afa-8afa-fafafafafafa','finalized');

 ok:=public.ag_finalize_daily_cycle(cp,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 IF ok THEN RAISE EXCEPTION 'Wrong finalization claim completed cycle'; END IF;
 IF (SELECT status FROM public.ag_daily_cycles WHERE id='fafafafa-fafa-4afa-8afa-fafafafafafa')<>'running'
 THEN RAISE EXCEPTION 'Rejected finalization mutated cycle'; END IF;

 ok:=public.ag_finalize_daily_cycle(cp,token);
 IF NOT ok THEN RAISE EXCEPTION 'Verified persistence did not finalize cycle'; END IF;
 IF (SELECT status FROM public.ag_daily_cycles WHERE id='fafafafa-fafa-4afa-8afa-fafafafafafa')<>'completed'
 THEN RAISE EXCEPTION 'Finalized cycle not marked completed'; END IF;
 IF (SELECT status FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'completed'
 THEN RAISE EXCEPTION 'Finalized checkpoint not completed'; END IF;
 ok:=public.ag_finalize_daily_cycle(cp,token);
 IF ok THEN RAISE EXCEPTION 'Consumed finalization claim succeeded twice'; END IF;
END $agfinalize$;

-- A cycle whose persistence stage is still running cannot claim finalized.
DO $agfinalizeblocked$
BEGIN
 BEGIN
  PERFORM public.ag_claim_cycle_stage('44444444-4444-4444-8444-444444444444','finalized');
  RAISE EXCEPTION 'Finalized claim bypassed incomplete persistence';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Finalized claim bypassed incomplete persistence' THEN RAISE; END IF;
 END;
END $agfinalizeblocked$;

DO $agfinalizepriv$
BEGIN
 IF has_function_privilege('anon','public.ag_finalize_daily_cycle(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'anon can execute AG finalizer'; END IF;
 IF has_function_privilege('public','public.ag_finalize_daily_cycle(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'PUBLIC can execute AG finalizer'; END IF;
 IF NOT has_function_privilege('authenticated','public.ag_finalize_daily_cycle(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'authenticated cannot execute AG finalizer'; END IF;
END $agfinalizepriv$;
