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
