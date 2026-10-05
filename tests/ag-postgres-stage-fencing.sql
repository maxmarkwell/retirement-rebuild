-- Disposable DB only. Stage claim ownership and lease fencing.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.ag_daily_cycles VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  current_date + 2,'running');
DO $agtest$
DECLARE checkpoint uuid; token uuid; other uuid; completed boolean;
BEGIN
 SELECT c.checkpoint_id,c.claim_token INTO checkpoint,token
 FROM public.ag_claim_cycle_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','holding_review') c;
 IF checkpoint IS NULL OR token IS NULL THEN RAISE EXCEPTION 'Stage claim missing'; END IF;
 BEGIN
  PERFORM public.ag_claim_cycle_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','holding_review');
  RAISE EXCEPTION 'Duplicate stage claim accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Duplicate stage claim accepted' THEN RAISE; END IF;
 END;
 completed := public.ag_complete_cycle_stage(checkpoint,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{}');
 IF completed THEN RAISE EXCEPTION 'Incorrect claim token completed stage'; END IF;
 UPDATE public.ag_cycle_stage_checkpoints SET lease_expires_at=now()-interval '1 minute'
 WHERE id=checkpoint;
 completed := public.ag_complete_cycle_stage(checkpoint,token,'{}');
 IF completed THEN RAISE EXCEPTION 'Expired claim completed stage'; END IF;
 BEGIN
  PERFORM public.ag_claim_cycle_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','holding_review');
  RAISE EXCEPTION 'Expired stage automatically reclaimed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Expired stage automatically reclaimed' THEN RAISE; END IF;
 END;
 -- Simulate explicit administrative recovery in disposable fixture only.
 UPDATE public.ag_cycle_stage_checkpoints
 SET status='pending',claim_token=NULL,lease_expires_at=NULL WHERE id=checkpoint;
 SELECT c.claim_token INTO other
 FROM public.ag_claim_cycle_stage('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','holding_review') c;
 IF other IS NULL OR other=token THEN RAISE EXCEPTION 'Reclaim did not rotate token'; END IF;
 completed := public.ag_complete_cycle_stage(checkpoint,token,'{}');
 IF completed THEN RAISE EXCEPTION 'Stale worker completed reclaimed stage'; END IF;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,other,'{}');
  RAISE EXCEPTION 'Missing holding intent accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Missing holding intent accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Full holding intent evidence required' THEN RAISE; END IF;
 END;
 completed := public.ag_complete_cycle_stage(checkpoint,other,
  '{"persistence_tickers":[],"source_symbols":[],"source_decisions":[],"decision_payloads":[],"source_count":0,"output_count":0,"failure_count":0}');
 IF NOT completed THEN RAISE EXCEPTION 'Current claim could not complete stage'; END IF;
 -- Committee completion rejects malformed caller-supplied manifests.
 INSERT INTO public.ag_cycle_stage_checkpoints
   (cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,
    attempt_count,claim_token,lease_expires_at)
 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333',
   'committee','running',1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   now()+interval '3 minutes')
 RETURNING id INTO checkpoint;
 token := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,'{}');
  RAISE EXCEPTION 'Missing Committee manifest accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Missing Committee manifest accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,
    '{"persistence_tickers":"ALPHA"}');
  RAISE EXCEPTION 'Non-array Committee manifest accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Non-array Committee manifest accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,
    '{"persistence_tickers":[]}');
  RAISE EXCEPTION 'Empty Committee manifest accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Empty Committee manifest accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,
    '{"persistence_tickers":["ALPHA","ALPHA"]}');
  RAISE EXCEPTION 'Duplicate Committee ticker accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Duplicate Committee ticker accepted' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,
    '{"persistence_tickers":["alpha"]}');
  RAISE EXCEPTION 'Malformed Committee ticker accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Malformed Committee ticker accepted' THEN RAISE; END IF;
 END;
 -- A valid ticker list without original source and payload evidence fails.
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,
    '{"persistence_tickers":["ALPHA","BETA"]}');
  RAISE EXCEPTION 'Ticker-only Committee checkpoint accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Ticker-only Committee checkpoint accepted' THEN RAISE; END IF;
 END;
 -- Full source set and canonical payload array must match one-to-one.
 BEGIN
  PERFORM public.ag_complete_cycle_stage(checkpoint,token,jsonb_build_object(
    'persistence_tickers',jsonb_build_array('ALPHA','BETA'),
    'source_symbols',jsonb_build_array('ALPHA','BETA'),
    'source_count',2,'output_count',2,'failure_count',0,
    'source_decisions',jsonb_build_array(
      jsonb_build_object('symbol','ALPHA'),jsonb_build_object('symbol','BETA')),
    'decision_payloads',jsonb_build_array(
      jsonb_build_object('ticker','ALPHA','args',jsonb_build_array(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'ALPHA','committee','watch','Alpha thesis',75,'short',
        null,null,null,null,null,null,null,null,null)),
      jsonb_build_object('ticker','ALPHA','args',jsonb_build_array(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'ALPHA','committee','watch','Duplicate thesis',75,'short',
        null,null,null,null,null,null,null,null,null)))));
  RAISE EXCEPTION 'Duplicate full Committee payload accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Duplicate full Committee payload accepted' THEN RAISE; END IF;
 END;
 completed := public.ag_complete_cycle_stage(checkpoint,token,
   jsonb_build_object(
    'persistence_tickers',jsonb_build_array('ALPHA','BETA'),
    'source_symbols',jsonb_build_array('ALPHA','BETA'),
    'source_count',2,'output_count',2,'failure_count',0,
    'source_decisions',jsonb_build_array(
      jsonb_build_object('symbol','ALPHA'),jsonb_build_object('symbol','BETA')),
    'decision_payloads',jsonb_build_array(
      jsonb_build_object('ticker','ALPHA','args',jsonb_build_array(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'ALPHA','committee','watch','Alpha thesis',75,'short',
        null,null,null,null,null,null,null,null,null)),
      jsonb_build_object('ticker','BETA','args',jsonb_build_array(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
        'BETA','committee','watch','Beta thesis',75,'short',
        null,null,null,null,null,null,null,null,null)))));
 IF NOT completed THEN RAISE EXCEPTION 'Valid full Committee manifest rejected'; END IF;

END $agtest$;

-- Nonempty holding checkpoint must preserve one-to-one source and payload
-- identities, including a correctly scoped canonical 16-field argument list.
INSERT INTO public.ag_daily_cycles VALUES
 ('edededed-eded-4ded-8ded-edededededed',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 current_date+7,'running');
DO $agtest$
DECLARE cp uuid; token uuid; ok boolean; payload jsonb;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('edededed-eded-4ded-8ded-edededededed','holding_review');
 payload:=jsonb_build_object(
  'persistence_tickers',jsonb_build_array('HELD'),
  'source_symbols',jsonb_build_array('HELD'),
  'source_count',1,'output_count',1,'failure_count',0,
  'source_decisions',jsonb_build_array(jsonb_build_object('symbol','HELD')),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
    'ticker','HELD','args',jsonb_build_array(
      'edededed-eded-4ded-8ded-edededededed'::uuid,
      'HELD','holding_review','hold','Holding thesis',70,'long',
      null,null,null,null,null,null,null,null,null))));
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,
    jsonb_set(payload,'{source_symbols}','["OTHER"]'::jsonb));
  RAISE EXCEPTION 'Mismatched holding source accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Mismatched holding source accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Holding intent identities or payloads inconsistent' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,
    jsonb_set(payload,'{decision_payloads,0,args,2}','"committee"'::jsonb));
  RAISE EXCEPTION 'Wrong-kind holding payload accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Wrong-kind holding payload accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Holding intent identities or payloads inconsistent' THEN RAISE; END IF;
 END;
 ok:=public.ag_complete_cycle_stage(cp,token,payload);
 IF NOT ok THEN RAISE EXCEPTION 'Valid nonempty holding checkpoint rejected'; END IF;
END $agtest$;


-- Deep-research checkpoint freezes structurally complete watchlist intent.
INSERT INTO public.ag_daily_cycles VALUES
 ('23232323-2323-4323-8323-232323232323',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',
 current_date+15,'running');
DO $agtest$
DECLARE cp uuid; token uuid:='24242424-2424-4424-8424-242424242424';
DECLARE ok boolean; payload jsonb;
BEGIN
 INSERT INTO public.ag_cycle_stage_checkpoints(
  cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,
  attempt_count,claim_token,lease_expires_at)
 VALUES (
  '23232323-2323-4323-8323-232323232323',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'catalyst_deep_research','running',1,token,now()+interval '5 minutes')
 RETURNING id INTO cp;
 payload:=jsonb_build_object(
  'watchlist_intent_count',1,
  'watchlist_intents',jsonb_build_array(jsonb_build_object(
   'stream','research_watch','symbol','FROZEN','source_row_id',null,
   'action','upsert_watch','outcome',jsonb_build_object(
    'symbol','FROZEN','companyName','Frozen Co','researchStatus','WATCH',
    'confidence',0.75,'thesis','Frozen thesis',
    'unresolvedQuestions',jsonb_build_array('Question'),
    'thesisClock','medium','invalidation',jsonb_build_array('Invalidation'),
    'model','model','promptVersion','v1','priorWatchReassessed',false,
    'priorWatchRowId',null))));
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,
    jsonb_set(payload,'{watchlist_intent_count}','2'::jsonb));
  RAISE EXCEPTION 'Mismatched watch intent count accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Mismatched watch intent count accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Valid frozen watchlist intent manifest required' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,
    jsonb_set(payload,'{watchlist_intents,0,outcome,confidence}','1.5'::jsonb));
  RAISE EXCEPTION 'Out-of-range watch confidence accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Out-of-range watch confidence accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Valid frozen watchlist intent manifest required' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,
    jsonb_set(payload,'{watchlist_intents,0,outcome,priorWatchReassessed}','true'::jsonb));
  RAISE EXCEPTION 'Watch source/reassessment mismatch accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Watch source/reassessment mismatch accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Valid frozen watchlist intent manifest required' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,jsonb_build_object(
   'watchlist_intent_count',2,'watchlist_intents',
   (payload->'watchlist_intents')||(payload->'watchlist_intents')));
  RAISE EXCEPTION 'Duplicate watch operation identity accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Duplicate watch operation identity accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Valid frozen watchlist intent manifest required' THEN RAISE; END IF;
 END;
 ok:=public.ag_complete_cycle_stage(cp,token,payload);
 IF NOT ok THEN RAISE EXCEPTION 'Valid frozen watchlist manifest rejected'; END IF;
END $agtest$;
