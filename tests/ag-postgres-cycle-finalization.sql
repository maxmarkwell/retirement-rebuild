-- Disposable DB only: finalization must require completed, verified persistence.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

DO $agfinalize$
DECLARE cp uuid; token uuid; ok boolean;
BEGIN
 -- Existing successful persistence fixture from ag-postgres-persistence-completion.sql.
 SELECT checkpoint_id,claim_token INTO cp,token
 FROM public.ag_claim_cycle_stage('cccccccc-cccc-4ccc-8ccc-cccccccccccc','finalized');

 ok:=public.ag_finalize_daily_cycle(cp,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 IF ok THEN RAISE EXCEPTION 'Wrong finalization claim completed cycle'; END IF;
 IF (SELECT status FROM public.ag_daily_cycles WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'running'
 THEN RAISE EXCEPTION 'Rejected finalization mutated cycle'; END IF;

 ok:=public.ag_finalize_daily_cycle(cp,token);
 IF NOT ok THEN RAISE EXCEPTION 'Verified persistence did not finalize cycle'; END IF;
 IF (SELECT status FROM public.ag_daily_cycles WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>'completed'
 THEN RAISE EXCEPTION 'Finalized cycle not marked completed'; END IF;
 IF (SELECT status FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'completed'
 THEN RAISE EXCEPTION 'Finalized checkpoint not completed'; END IF;
 ok:=public.ag_finalize_daily_cycle(cp,token);
 IF ok THEN RAISE EXCEPTION 'Consumed finalization claim succeeded twice'; END IF;
END $agfinalize$;

-- A cycle whose persistence stage is still running cannot even claim finalized.
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
