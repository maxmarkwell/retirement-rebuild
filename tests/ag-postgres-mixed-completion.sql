-- Disposable mixed holding + Committee completion, exact union and hashes.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.ag_daily_cycles VALUES (
 '14141414-1414-4414-8414-141414141414',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+11,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 '14141414-1414-4414-8414-141414141414',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','holding_review','completed',
 jsonb_build_object(
  'persistence_tickers',jsonb_build_array('MIXHOLD'),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
   'ticker','MIXHOLD','args',jsonb_build_array(
    '14141414-1414-4414-8414-141414141414'::uuid,
    'MIXHOLD','holding_review','hold','Mixed holding',71::numeric,
    'long',null,null,null,null,'{"agHoldingReview":true}'::text,
    null,null,null,null))))),
 (
 '14141414-1414-4414-8414-141414141414',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','committee','completed',
 jsonb_build_object(
  'persistence_tickers',jsonb_build_array('MIXBUY'),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
   'ticker','MIXBUY','args',jsonb_build_array(
    '14141414-1414-4414-8414-141414141414'::uuid,
    'MIXBUY','committee','watch','Mixed committee',74::numeric,
    'short',null,null,null,null,null,null,null,null,null))))
 );
DO $agtest$
DECLARE cp uuid; token uuid; ok boolean;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('14141414-1414-4414-8414-141414141414','persistence');
 PERFORM public.ag_commit_cycle_decision(
  '14141414-1414-4414-8414-141414141414',token,'MIXBUY',
  'committee','watch','Mixed committee',74,'short',null,null,null,null,null);
 ok:=public.ag_complete_persistence_stage(cp,token,ARRAY['MIXBUY','MIXHOLD']);
 IF ok THEN RAISE EXCEPTION 'Mixed completion ignored missing holding ledger'; END IF;
 PERFORM public.ag_commit_cycle_decision(
  '14141414-1414-4414-8414-141414141414',token,'MIXHOLD',
  'holding_review','hold','Mixed holding',71,'long',
  null,null,null,null,'{"agHoldingReview":true}');
 ok:=public.ag_complete_persistence_stage(cp,token,ARRAY['MIXBUY']);
 IF ok THEN RAISE EXCEPTION 'Mixed completion accepted Committee-only subset'; END IF;
 ok:=public.ag_complete_persistence_stage(cp,token,ARRAY['MIXBUY','WRONG']);
 IF ok THEN RAISE EXCEPTION 'Mixed completion accepted wrong same-size union'; END IF;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=repeat('f',64)
 WHERE cycle_id='14141414-1414-4414-8414-141414141414' AND ticker='MIXHOLD';
 ok:=public.ag_complete_persistence_stage(cp,token,ARRAY['MIXBUY','MIXHOLD']);
 IF ok THEN RAISE EXCEPTION 'Mixed completion accepted altered holding hash'; END IF;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=encode(extensions.digest(
  convert_to(jsonb_build_array(
   '14141414-1414-4414-8414-141414141414'::uuid,
   'MIXHOLD','holding_review','hold','Mixed holding',71::numeric,
   'long',null,null,null,null,'{"agHoldingReview":true}'::text,
   null,null,null,null)::text,'UTF8'),'sha256'),'hex')
 WHERE cycle_id='14141414-1414-4414-8414-141414141414' AND ticker='MIXHOLD';
 ok:=public.ag_complete_persistence_stage(cp,token,ARRAY['MIXBUY','MIXHOLD']);
 IF NOT ok THEN RAISE EXCEPTION 'Exact verified mixed batch failed completion'; END IF;
 IF (SELECT output->>'holding_payload_hashes_verified'
     FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'true'
 THEN RAISE EXCEPTION 'Combined completion missing holding evidence'; END IF;
END $agtest$;
