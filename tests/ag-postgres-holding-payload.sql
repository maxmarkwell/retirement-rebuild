-- Isolated full holding-review digest and linked decision verification.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.ag_daily_cycles VALUES (
 '12121212-1212-4212-8212-121212121212',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+9,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 '12121212-1212-4212-8212-121212121212',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','holding_review','completed',
 jsonb_build_object(
  'persistence_tickers',jsonb_build_array('HVERIFY'),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
   'ticker','HVERIFY','args',jsonb_build_array(
    '12121212-1212-4212-8212-121212121212'::uuid,
    'HVERIFY','holding_review','hold','Holding evidence',72::numeric,
    'long','Bull','Bear','Monitor','Invalidate','{"agHoldingReview":true}'::text,
    null,null,null,null))))),
 (
 '12121212-1212-4212-8212-121212121212',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','committee','completed',
 '{"persistence_tickers":["OTHER"]}'::jsonb
 );
DO $agtest$
DECLARE cp uuid; token uuid; decision_id uuid;
BEGIN
 IF public.ag_verify_holding_payload_manifest('12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Uncommitted holding manifest verified'; END IF;
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('12121212-1212-4212-8212-121212121212','persistence');
 decision_id:=public.ag_commit_cycle_decision(
  '12121212-1212-4212-8212-121212121212',token,'HVERIFY',
  'holding_review','hold','Holding evidence',72,'long',
  'Bull','Bear','Monitor','Invalidate','{"agHoldingReview":true}');
 IF decision_id IS NULL OR NOT public.ag_verify_holding_payload_manifest(
    '12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Matching holding payload did not verify'; END IF;
 UPDATE public.investment_decisions SET thesis='Altered holding content'
 WHERE id=decision_id;
 IF public.ag_verify_holding_payload_manifest('12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Changed holding decision content verified'; END IF;
 UPDATE public.investment_decisions SET thesis='Holding evidence'
 WHERE id=decision_id;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=repeat('b',64)
 WHERE cycle_id='12121212-1212-4212-8212-121212121212';
 IF public.ag_verify_holding_payload_manifest('12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Tampered holding digest verified'; END IF;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=encode(public.digest(
  convert_to(jsonb_build_array(
   '12121212-1212-4212-8212-121212121212'::uuid,
   'HVERIFY','holding_review','hold','Holding evidence',72::numeric,
   'long','Bull','Bear','Monitor','Invalidate','{"agHoldingReview":true}'::text,
   null,null,null,null)::text,'UTF8'),'sha256'),'hex')
 WHERE cycle_id='12121212-1212-4212-8212-121212121212';
 IF NOT public.ag_verify_holding_payload_manifest('12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Restored holding digest failed verification'; END IF;
END $agtest$;
-- A completed explicit empty holding batch has no matching ledger writes.
INSERT INTO public.ag_daily_cycles VALUES (
 '13131313-1313-4313-8313-131313131313',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+10,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 '13131313-1313-4313-8313-131313131313',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','holding_review','completed',
 '{"persistence_tickers":[],"decision_payloads":[]}'::jsonb);
DO $agtest$ BEGIN
 IF NOT public.ag_verify_holding_payload_manifest('13131313-1313-4313-8313-131313131313')
 THEN RAISE EXCEPTION 'Explicit empty holding batch rejected'; END IF;
END $agtest$;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $agtest$ BEGIN
 IF public.ag_verify_holding_payload_manifest('12121212-1212-4212-8212-121212121212')
 THEN RAISE EXCEPTION 'Cross-owner holding verification succeeded'; END IF;
END $agtest$;
