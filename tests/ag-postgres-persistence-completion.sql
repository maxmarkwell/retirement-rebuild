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
 'committee','completed',jsonb_build_object(
  'persistence_tickers',jsonb_build_array('SUCCESS'),
  'decision_payloads',jsonb_build_array(jsonb_build_object(
   'ticker','SUCCESS','args',jsonb_build_array(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
    'SUCCESS','committee','watch','Success-path thesis',75::numeric,
    'short',null,null,null,null,null,null,null,null,null))))
);
DO $$
DECLARE cp uuid; token uuid; v_decision_id uuid; ok boolean;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence');
 v_decision_id := public.ag_commit_cycle_decision(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',token,'SUCCESS',
  'committee','watch','Success-path thesis',75,'short',null,null,null,null,null
 );
 IF v_decision_id IS NULL THEN RAISE EXCEPTION 'Fixture decision missing'; END IF;
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

-- A subset or same-size incorrect ticker list must not complete a cycle.
INSERT INTO public.ag_daily_cycles VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
  current_date+4,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(
 cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output
) VALUES (
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
 'committee','completed',jsonb_build_object(
  'persistence_tickers',jsonb_build_array('ALPHA','BETA'),
  'decision_payloads',jsonb_build_array(
   jsonb_build_object('ticker','ALPHA','args',jsonb_build_array(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'ALPHA','committee','watch','Alpha thesis',75::numeric,
    'short',null,null,null,null,null,null,null,null,null)),
   jsonb_build_object('ticker','BETA','args',jsonb_build_array(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,
    'BETA','committee','watch','Beta thesis',75::numeric,
    'short',null,null,null,null,null,null,null,null,null))))
);
DO $$
DECLARE cp uuid; token uuid; ok boolean;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token FROM
 public.ag_claim_cycle_stage('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','persistence');
 PERFORM public.ag_commit_cycle_decision(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',token,'ALPHA',
  'committee','watch','Alpha thesis',75,'short',null,null,null,null,null
 );
 PERFORM public.ag_commit_cycle_decision(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',token,'BETA',
  'committee','watch','Beta thesis',75,'short',null,null,null,null,null
 );
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA']);
 IF ok THEN RAISE EXCEPTION 'Subset completed persistence despite extra ledger row'; END IF;
 -- Completed Committee output is immutable, even if a privileged writer
 -- attempts to replace the expected ticker manifest.
 BEGIN
  UPDATE public.ag_cycle_stage_checkpoints
  SET output='{"persistence_tickers":["ALPHA"]}'::jsonb
  WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND stage='committee';
  RAISE EXCEPTION 'Completed Committee manifest was mutable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Completed Committee manifest was mutable' THEN RAISE; END IF;
 END;
 -- A completed checkpoint's scope and completion timestamp are evidence.
 BEGIN
  UPDATE public.ag_cycle_stage_checkpoints
  SET portfolio_id='99999999-9999-4999-8999-999999999999'
  WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND stage='committee';
  RAISE EXCEPTION 'Completed Committee scope was mutable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Completed Committee scope was mutable' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE public.ag_cycle_stage_checkpoints
  SET completed_at=now()+interval '1 hour'
  WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND stage='committee';
  RAISE EXCEPTION 'Completed Committee timestamp was mutable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Completed Committee timestamp was mutable' THEN RAISE; END IF;
 END;
 BEGIN
  DELETE FROM public.ag_cycle_stage_checkpoints
  WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND stage='committee';
  RAISE EXCEPTION 'Completed Committee checkpoint was deletable';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Completed Committee checkpoint was deletable' THEN RAISE; END IF;
 END;
 -- Committee-only completion must not silently certify a holding review.
 UPDATE public.ag_cycle_decision_writes SET decision_kind='holding_review'
 WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='ALPHA';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF ok THEN RAISE EXCEPTION 'Mixed decision kinds completed Committee-only persistence'; END IF;
 UPDATE public.ag_cycle_decision_writes SET decision_kind='committee'
 WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='ALPHA';
 -- A matching active ID is insufficient if its source or era is wrong.
 UPDATE public.investment_decisions SET source='manual'
 WHERE ticker='ALPHA' AND portfolio_id='22222222-2222-4222-8222-222222222222'
   AND status='active';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF ok THEN RAISE EXCEPTION 'Non-Committee decision completed persistence'; END IF;
 UPDATE public.investment_decisions SET source='ai_committee'
 WHERE ticker='ALPHA' AND portfolio_id='22222222-2222-4222-8222-222222222222'
   AND status='active';
 UPDATE public.investment_decisions
 SET created_at=now()-interval '10 days'
 WHERE ticker='ALPHA' AND portfolio_id='22222222-2222-4222-8222-222222222222'
   AND status='active';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF ok THEN RAISE EXCEPTION 'Pre-era decision completed persistence'; END IF;
 UPDATE public.investment_decisions SET created_at=now()
 WHERE ticker='ALPHA' AND portfolio_id='22222222-2222-4222-8222-222222222222'
   AND status='active';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','GAMMA']);
 IF ok THEN RAISE EXCEPTION 'Incorrect same-size ticker list completed persistence'; END IF;
 IF (SELECT status FROM public.ag_cycle_stage_checkpoints WHERE id=cp)<>'running'
 THEN RAISE EXCEPTION 'Rejected completion mutated stage'; END IF;
 -- Corrupt decision linkage without changing the expected ticker set.
 UPDATE public.investment_decisions SET status='superseded'
 WHERE id=(SELECT investment_decision_id FROM public.ag_cycle_decision_writes
           WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='BETA');
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF ok THEN RAISE EXCEPTION 'Inactive linked decision completed persistence'; END IF;
 UPDATE public.investment_decisions SET status='active'
 WHERE id=(SELECT investment_decision_id FROM public.ag_cycle_decision_writes
           WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='BETA');
 UPDATE public.ag_cycle_decision_writes
 SET investment_decision_id=(SELECT investment_decision_id FROM public.ag_cycle_decision_writes
   WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='ALPHA')
 WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='BETA';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF ok THEN RAISE EXCEPTION 'Wrong linked decision completed persistence'; END IF;
 UPDATE public.ag_cycle_decision_writes w
 SET investment_decision_id=(SELECT d.id FROM public.investment_decisions d
   WHERE d.ticker='BETA' AND d.portfolio_id=w.portfolio_id AND d.status='active'
   ORDER BY d.created_at DESC LIMIT 1)
 WHERE cycle_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' AND ticker='BETA';
 ok := public.ag_complete_persistence_stage(cp,token,ARRAY['ALPHA','BETA']);
 IF NOT ok THEN RAISE EXCEPTION 'Exact two-decision ledger rejected'; END IF;
END $$;
