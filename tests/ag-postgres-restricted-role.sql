-- Disposable Postgres only: exercise grants and RLS as the restricted app role.
GRANT USAGE ON SCHEMA public, auth TO authenticated;
-- Direct recovery-table access must remain unavailable to authenticated.
-- SECURITY DEFINER RPC must be callable, but direct ledger mutation forbidden.
GRANT EXECUTE ON FUNCTION public.ag_commit_cycle_decision(
 uuid,uuid,text,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,text,text
) TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE visible integer; result_id uuid;
BEGIN
 BEGIN
  SELECT count(*) INTO visible FROM public.ag_cycle_decision_writes;
  RAISE EXCEPTION 'Restricted role unexpectedly read ledger directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT count(*) INTO visible FROM public.ag_read_cycle_decision_ledger(
   '44444444-4444-4444-8444-444444444444');
 IF visible = 0 THEN RAISE EXCEPTION 'Owner cannot read scoped ledger RPC'; END IF;
 BEGIN
  INSERT INTO public.ag_cycle_decision_writes(
    cycle_id,user_id,portfolio_id,strategy_era_id,ticker,decision_kind,payload_hash
  ) VALUES (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    'ILLEGAL','committee',repeat('a',64)
  );
  RAISE EXCEPTION 'Restricted role unexpectedly inserted ledger';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  INSERT INTO public.investment_decisions(user_id,portfolio_id,ticker,decision_type,source,status,thesis)
  VALUES ('11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222','ILLEGAL','watch',
          'ai_committee','active','Direct write should fail');
  RAISE EXCEPTION 'Restricted role unexpectedly inserted decision';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 result_id := public.ag_commit_cycle_decision(
   '44444444-4444-4444-8444-444444444444',
   '55555555-5555-4555-8555-555555555555',
   'ROLECHECK','committee','watch','Restricted role test',75,'short',
   null,null,null,null,null
 );
 IF result_id IS NULL THEN RAISE EXCEPTION 'Restricted role RPC returned null'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $agcrossowner$
DECLARE visible integer; b boolean;
BEGIN
 SELECT count(*) INTO visible FROM public.ag_read_cycle_checkpoint_status(
   '44444444-4444-4444-8444-444444444444');
 IF visible<>0 THEN RAISE EXCEPTION 'Checkpoint status leaked cross-owner rows'; END IF;
 SELECT count(*) INTO visible FROM public.ag_read_cycle_watch_ledger(
   '44444444-4444-4444-8444-444444444444');
 IF visible<>0 THEN RAISE EXCEPTION 'Watch ledger leaked cross-owner rows'; END IF;
 SELECT count(*) INTO visible FROM public.ag_read_completed_stage_output(
   '44444444-4444-4444-8444-444444444444','committee');
 IF visible<>0 THEN RAISE EXCEPTION 'Completed stage output leaked cross-owner evidence'; END IF;
 b:=public.ag_verify_cycle_watch_manifest('44444444-4444-4444-8444-444444444444');
 IF b THEN RAISE EXCEPTION 'Watch manifest verifier accepted cross-owner cycle'; END IF;
 b:=public.ag_verify_committee_payload_manifest('44444444-4444-4444-8444-444444444444');
 IF b THEN RAISE EXCEPTION 'Committee verifier accepted cross-owner cycle'; END IF;
 b:=public.ag_verify_holding_payload_manifest('44444444-4444-4444-8444-444444444444');
 IF b THEN RAISE EXCEPTION 'Holding verifier accepted cross-owner cycle'; END IF;
END $agcrossowner$;

DO $
DECLARE visible integer;
BEGIN
 SELECT count(*) INTO visible FROM public.ag_read_cycle_decision_ledger(
   '44444444-4444-4444-8444-444444444444');
 IF visible <> 0 THEN RAISE EXCEPTION 'Scoped ledger RPC leaked another owners ledger'; END IF;
 BEGIN
  PERFORM public.ag_commit_cycle_decision(
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    'CROSSOWNER','committee','watch','Unauthorized test',75,'short',
    null,null,null,null,null
  );
  RAISE EXCEPTION 'Cross-owner RPC unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Cross-owner RPC unexpectedly accepted' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
