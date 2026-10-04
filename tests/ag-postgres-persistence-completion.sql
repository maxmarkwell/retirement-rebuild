-- Disposable DB: generic completion must not bypass persistence ledger.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE cp uuid; token uuid; ok boolean;
BEGIN
 SELECT id,claim_token INTO cp,token FROM public.ag_cycle_stage_checkpoints
 WHERE cycle_id='44444444-4444-4444-8444-444444444444' AND stage='persistence';
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,'{}');
  RAISE EXCEPTION 'Generic persistence completion bypassed ledger';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Generic persistence completion bypassed ledger' THEN RAISE; END IF;
 END;
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['TEST']);
 IF ok THEN RAISE EXCEPTION 'Incomplete expected ticker list accepted'; END IF;
 BEGIN
  PERFORM public.ag_complete_persistence_stage(cp,token,ARRAY['TEST','TEST']);
  RAISE EXCEPTION 'Duplicate expected ticker list accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Duplicate expected ticker list accepted' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'running'
 THEN RAISE EXCEPTION 'Failed completion changed stage'; END IF;
END $$;
