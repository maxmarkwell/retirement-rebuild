-- Disposable actual-schema compatibility checks. Never run against production.
INSERT INTO auth.users VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.portfolios VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','paper_active',false);
INSERT INTO public.portfolio_strategy_eras VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accelerated_growth','paper',null,now()-interval '1 day');
INSERT INTO public.ag_daily_cycles VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["PREERA"]}');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',now()+interval '10 minutes');

-- Reproduce the audited cross-era uniqueness/trigger hazard. The recovery RPC
-- must fail before INSERT so the live trigger cannot supersede historical state.
INSERT INTO public.investment_decisions(user_id,portfolio_id,ticker,decision_type,source,status,thesis)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','PREERA','watch','ai_committee','active','Historical thesis');
UPDATE public.investment_decisions
SET created_at = now()-interval '2 days'
WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  AND portfolio_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  AND ticker='PREERA';
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
BEGIN
  BEGIN
    PERFORM public.ag_commit_cycle_decision(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'PREERA','committee','watch','Current thesis',80,'long',null,null,null,null,null);
    RAISE EXCEPTION 'Actual-schema pre-era conflict unexpectedly committed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='Actual-schema pre-era conflict unexpectedly committed' THEN RAISE; END IF;
    IF SQLERRM<>'Pre-era active AI decision requires manual reconciliation' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.investment_decisions WHERE ticker='PREERA') <> 'active'
    THEN RAISE EXCEPTION 'Actual-schema trigger mutated historical decision'; END IF;
  IF EXISTS (SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='PREERA')
    THEN RAISE EXCEPTION 'Actual-schema conflict left ledger evidence'; END IF;
END $$;

-- Recovery tables remain private even though owner-scoped read RPCs are executable.
GRANT USAGE ON SCHEMA public, auth TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE n integer;
BEGIN
  BEGIN PERFORM 1 FROM public.ag_cycle_decision_writes;
    RAISE EXCEPTION 'Authenticated read decision ledger directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.ag_cycle_watch_writes;
    RAISE EXCEPTION 'Authenticated read watch ledger directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.ag_cycle_stage_checkpoints;
    RAISE EXCEPTION 'Authenticated read checkpoints directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO n FROM public.ag_read_cycle_checkpoint_status('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  IF n <> 2 THEN RAISE EXCEPTION 'Owner checkpoint status RPC did not return expected rows'; END IF;
END $$;
RESET ROLE;

-- Audited-schema cross-cycle fencing: a newer committed ticker must win.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.ag_daily_cycles(id,user_id,portfolio_id,strategy_era_id,cycle_date,status) VALUES
 ('12121212-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date-interval '2 days','running'),
 ('13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date-interval '1 day','running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output) VALUES
 ('12121212-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["AFENCE"]}'),
 ('13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["AFENCE"]}');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at) VALUES
 ('12121212-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','14141414-1414-4414-8414-141414141414',now()+interval '10 minutes'),
 ('13131313-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','15151515-1515-4515-8515-151515151515',now()+interval '10 minutes');

DO $$
DECLARE newer_id uuid;
BEGIN
 newer_id := public.ag_commit_cycle_decision(
  '13131313-1313-4313-8313-131313131313','15151515-1515-4515-8515-151515151515',
  'AFENCE','committee','watch','Audited newer thesis',75,'short',NULL,NULL,NULL,NULL,NULL
 );
 IF newer_id IS NULL THEN RAISE EXCEPTION 'Audited newer-cycle decision failed'; END IF;
 BEGIN
  PERFORM public.ag_commit_cycle_decision(
   '12121212-1212-4212-8212-121212121212','14141414-1414-4414-8414-141414141414',
   'AFENCE','committee','avoid','Audited stale thesis',75,'short',NULL,NULL,NULL,NULL,NULL
  );
  RAISE EXCEPTION 'Audited older cycle unexpectedly committed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Audited older cycle unexpectedly committed' THEN RAISE; END IF;
  IF SQLERRM<>'Newer AG cycle already committed this ticker; manual reconciliation required' THEN RAISE; END IF;
 END;
 IF NOT EXISTS (
  SELECT 1 FROM public.investment_decisions
  WHERE id=newer_id AND ticker='AFENCE' AND status='active'
 ) THEN RAISE EXCEPTION 'Audited newer-cycle decision was altered'; END IF;
 IF EXISTS (
  SELECT 1 FROM public.ag_cycle_decision_writes
  WHERE cycle_id='12121212-1212-4212-8212-121212121212' AND ticker='AFENCE'
 ) THEN RAISE EXCEPTION 'Audited stale cycle left decision-ledger evidence'; END IF;
END $$;
