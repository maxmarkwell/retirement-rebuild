-- Disposable PostgreSQL only: verify full immutable Committee argument
-- snapshots against server-derived committed ledger hashes.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.ag_daily_cycles VALUES (
 'abababab-abab-4bab-8bab-abababababab',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333',current_date+5,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 'abababab-abab-4bab-8bab-abababababab',
 '11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333','committee','completed',
 jsonb_build_object(
  'persistence_tickers',jsonb_build_array('PAYLOAD'),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
   'ticker','PAYLOAD','args',jsonb_build_array(
    'abababab-abab-4bab-8bab-abababababab'::uuid,
    'PAYLOAD','committee','watch','Frozen payload thesis',75::numeric,
    'short',null,null,null,null,null,null,null,null,null)
  ))
 ));
DO $agtest$
DECLARE cp uuid; token uuid; result_id uuid;
BEGIN
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Uncommitted payload verified'; END IF;
 SELECT checkpoint_id,claim_token INTO cp,token
 FROM public.ag_claim_cycle_stage('abababab-abab-4bab-8bab-abababababab','persistence');
 result_id:=public.ag_commit_cycle_decision(
  'abababab-abab-4bab-8bab-abababababab',token,
  'PAYLOAD','committee','watch','Frozen payload thesis',75,'short',
  null,null,null,null,null);
 IF result_id IS NULL OR NOT public.ag_verify_committee_payload_manifest(
    'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Matching frozen payload failed verification'; END IF;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=repeat('a',64)
 WHERE cycle_id='abababab-abab-4bab-8bab-abababababab';
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Mismatched ledger digest verified'; END IF;
 UPDATE public.ag_cycle_decision_writes SET payload_hash=encode(public.digest(
   convert_to(jsonb_build_array(
    'abababab-abab-4bab-8bab-abababababab'::uuid,
    'PAYLOAD','committee','watch','Frozen payload thesis',75::numeric,
    'short',null,null,null,null,null,null,null,null,null)::text,'UTF8'),
   'sha256'),'hex')
 WHERE cycle_id='abababab-abab-4bab-8bab-abababababab';
 UPDATE public.investment_decisions SET thesis='Altered after commit'
 WHERE id=result_id;
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Changed linked decision thesis verified'; END IF;
 UPDATE public.investment_decisions SET thesis='Frozen payload thesis'
 WHERE id=result_id;
 UPDATE public.investment_decisions SET source='manual' WHERE id=result_id;
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Invalid decision linkage verified'; END IF;
 UPDATE public.investment_decisions SET source='ai_committee' WHERE id=result_id;
 IF NOT public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Restored payload did not verify'; END IF;
 -- An extra pending row must not be hidden by the manifest's valid entry.
 INSERT INTO public.ag_cycle_decision_writes(
  cycle_id,user_id,portfolio_id,strategy_era_id,ticker,decision_kind,payload_hash
 ) VALUES (
  'abababab-abab-4bab-8bab-abababababab',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'EXTRA','committee',repeat('b',64)
 );
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Unexpected ledger row passed full manifest check'; END IF;
 DELETE FROM public.ag_cycle_decision_writes
 WHERE cycle_id='abababab-abab-4bab-8bab-abababababab' AND ticker='EXTRA';
 -- Completed intent must not be mutable to match a later altered digest.
 BEGIN
  UPDATE public.ag_cycle_stage_checkpoints SET output='{}'::jsonb
  WHERE cycle_id='abababab-abab-4bab-8bab-abababababab' AND stage='committee';
  RAISE EXCEPTION 'Completed payload manifest could be changed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Completed payload manifest could be changed' THEN RAISE; END IF;
 END;
END $agtest$;
-- A caller from a different account cannot use this as an oracle.
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $agtest$ BEGIN
 IF public.ag_verify_committee_payload_manifest(
   'abababab-abab-4bab-8bab-abababababab')
 THEN RAISE EXCEPTION 'Cross-owner payload verification succeeded'; END IF;
END $agtest$;
