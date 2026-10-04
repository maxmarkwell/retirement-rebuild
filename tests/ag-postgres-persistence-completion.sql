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

-- Fresh isolated cycle with exactly one committed decision: success path.
INSERT INTO public.ag_daily_cycles VALUES
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  current_date+3,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
 'committee','completed','{}'
);
DO $$
DECLARE cp uuid; token uuid; id uuid; ok boolean;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence');
 id := public.ag_commit_cycle_decision(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',token,'SUCCESS',
  'committee','watch','Success-path thesis',75,'short',null,null,null,null,null
 );
 IF id IS NULL THEN RAISE EXCEPTION 'Fixture decision missing'; END IF;
 ok := public.ag_complete_persistence_stage(cp,
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd',ARRAY['SUCCESS']);
 IF ok THEN RAISE EXCEPTION 'Wrong claim completed persistence'; END IF;
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['SUCCESS']);
 IF NOT ok THEN RAISE EXCEPTION 'Complete ledger did not finish persistence'; END IF;
 IF (SELECT status FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'completed'
 THEN RAISE EXCEPTION 'Completed stage not persisted'; END IF;
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['SUCCESS']);
 IF ok THEN RAISE EXCEPTION 'Consumed token completed stage twice'; END IF;
END $$;
