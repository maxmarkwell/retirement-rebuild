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
 ('a1212121-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date-interval '2 days','running'),
 ('a1313131-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date-interval '1 day','running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output) VALUES
 ('a1212121-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["AFENCE"]}'),
 ('a1313131-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["AFENCE"]}');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at) VALUES
 ('a1212121-1212-4212-8212-121212121212','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','a1414141-1414-4414-8414-141414141414',now()+interval '10 minutes'),
 ('a1313131-1313-4313-8313-131313131313','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','a1515151-1515-4515-8515-151515151515',now()+interval '10 minutes');

DO $$
DECLARE newer_id uuid;
BEGIN
 newer_id := public.ag_commit_cycle_decision(
  'a1313131-1313-4313-8313-131313131313','a1515151-1515-4515-8515-151515151515',
  'AFENCE','committee','watch','Audited newer thesis',75,'short',NULL,NULL,NULL,NULL,NULL
 );
 IF newer_id IS NULL THEN RAISE EXCEPTION 'Audited newer-cycle decision failed'; END IF;
 BEGIN
  PERFORM public.ag_commit_cycle_decision(
   'a1212121-1212-4212-8212-121212121212','a1414141-1414-4414-8414-141414141414',
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
  WHERE cycle_id='a1212121-1212-4212-8212-121212121212' AND ticker='AFENCE'
 ) THEN RAISE EXCEPTION 'Audited stale cycle left decision-ledger evidence'; END IF;
END $$;

-- Audited-schema atomic rollback: use a dedicated cycle with an immutable manifest.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.ag_daily_cycles(id,user_id,portfolio_id,strategy_era_id,cycle_date,status) VALUES
 ('a1616161-1616-4616-8616-161616161616','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date+1,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output) VALUES
 ('a1616161-1616-4616-8616-161616161616','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["AROLL"]}');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at) VALUES
 ('a1616161-1616-4616-8616-161616161616','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','a1717171-1717-4717-8717-171717171717',now()+interval '10 minutes');
INSERT INTO public.investment_decisions(user_id,portfolio_id,ticker,decision_type,source,status,thesis,created_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','AROLL','hold','ai_committee','active','Audited existing decision',now());
ALTER TABLE public.investment_decisions ADD CONSTRAINT ag_actual_reject_rollback_thesis CHECK (thesis <> 'Audited forced rollback');
DO $$ BEGIN
 BEGIN
  PERFORM public.ag_commit_cycle_decision('a1616161-1616-4616-8616-161616161616','a1717171-1717-4717-8717-171717171717','AROLL','committee','watch','Audited forced rollback',75,'short',NULL,NULL,NULL,NULL,NULL);
  RAISE EXCEPTION 'Audited failed INSERT unexpectedly committed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Audited failed INSERT unexpectedly committed' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM public.investment_decisions WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND portfolio_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND ticker='AROLL' AND status='active')<>1 THEN RAISE EXCEPTION 'Audited rollback did not preserve prior active decision'; END IF;
 IF EXISTS (SELECT 1 FROM public.investment_decisions WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND portfolio_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND ticker='AROLL' AND status='superseded') THEN RAISE EXCEPTION 'Audited rollback left superseded state'; END IF;
 IF EXISTS (SELECT 1 FROM public.ag_cycle_decision_writes WHERE cycle_id='a1616161-1616-4616-8616-161616161616' AND ticker='AROLL') THEN RAISE EXCEPTION 'Audited rollback left decision-ledger evidence'; END IF;
END $$;
ALTER TABLE public.investment_decisions DROP CONSTRAINT ag_actual_reject_rollback_thesis;

-- Audited-schema interrupted batch resume with a complete immutable manifest.
INSERT INTO public.ag_daily_cycles(id,user_id,portfolio_id,strategy_era_id,cycle_date,status) VALUES
 ('a1818181-1818-4818-8818-181818181818','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date+2,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output) VALUES
 ('a1818181-1818-4818-8818-181818181818','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','committee','completed','{"persistence_tickers":["ABATCHA","ABATCHB"]}');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at) VALUES
 ('a1818181-1818-4818-8818-181818181818','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','persistence','running','a1919191-1919-4919-8919-191919191919',now()+interval '10 minutes');
DO $$ DECLARE first_id uuid; BEGIN
 first_id:=public.ag_commit_cycle_decision('a1818181-1818-4818-8818-181818181818','a1919191-1919-4919-8919-191919191919','ABATCHA','committee','watch','Audited first batch item',70,'short',NULL,NULL,NULL,NULL,NULL);
 IF first_id IS NULL THEN RAISE EXCEPTION 'Audited first batch item missing'; END IF;
END $$;
DO $$ DECLARE first_id uuid; retry_id uuid; second_id uuid; BEGIN
 SELECT investment_decision_id INTO first_id FROM public.ag_cycle_decision_writes WHERE cycle_id='a1818181-1818-4818-8818-181818181818' AND ticker='ABATCHA';
 retry_id:=public.ag_commit_cycle_decision('a1818181-1818-4818-8818-181818181818','a1919191-1919-4919-8919-191919191919','ABATCHA','committee','watch','Audited first batch item',70,'short',NULL,NULL,NULL,NULL,NULL);
 second_id:=public.ag_commit_cycle_decision('a1818181-1818-4818-8818-181818181818','a1919191-1919-4919-8919-191919191919','ABATCHB','committee','watch','Audited second batch item',70,'short',NULL,NULL,NULL,NULL,NULL);
 IF retry_id IS DISTINCT FROM first_id OR second_id IS NULL THEN RAISE EXCEPTION 'Audited interrupted batch resume failed'; END IF;
 IF (SELECT count(*) FROM public.ag_cycle_decision_writes WHERE cycle_id='a1818181-1818-4818-8818-181818181818' AND ticker IN ('ABATCHA','ABATCHB') AND status='committed')<>2 THEN RAISE EXCEPTION 'Audited interrupted batch ledger incomplete'; END IF;
 IF (SELECT count(*) FROM public.investment_decisions WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' AND portfolio_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' AND ticker IN ('ABATCHA','ABATCHB') AND status='active')<>2 THEN RAISE EXCEPTION 'Audited interrupted batch produced duplicate or missing decisions'; END IF;
END $$;


-- Completed stage output is readable only through the owner-scoped RPC.
RESET ROLE;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$
DECLARE n integer; payload jsonb;
BEGIN
 SELECT count(*) INTO n
 FROM public.ag_read_completed_stage_output('dddddddd-dddd-4ddd-8ddd-dddddddddddd','committee');
 SELECT output INTO payload
 FROM public.ag_read_completed_stage_output('dddddddd-dddd-4ddd-8ddd-dddddddddddd','committee');
 IF n<>1 OR payload IS NULL THEN RAISE EXCEPTION 'Owner completed-output RPC failed'; END IF;
 SELECT count(*) INTO n
 FROM public.ag_read_completed_stage_output('dddddddd-dddd-4ddd-8ddd-dddddddddddd','persistence');
 IF n<>0 THEN RAISE EXCEPTION 'Running stage leaked through completed-output RPC'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n
 FROM public.ag_read_completed_stage_output('dddddddd-dddd-4ddd-8ddd-dddddddddddd','committee');
 IF n<>0 THEN RAISE EXCEPTION 'Cross-owner completed-output RPC leaked evidence'; END IF;
END $$;
RESET ROLE;


-- Discovery checkpoint completion rejects incomplete handoffs (and exercises the SQL-side handoff validator) and accepts a
-- minimal structurally complete frozen snapshot.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO public.ag_daily_cycles(id,user_id,portfolio_id,strategy_era_id,cycle_date,status) VALUES
 ('a2020202-2020-4020-8020-202020202020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_date+3,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(id,cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output,claim_token,lease_expires_at) VALUES
 ('a2111111-1111-4111-8111-111111111111','a2020202-2020-4020-8020-202020202020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','holding_review','completed','{}'::jsonb,NULL,NULL),
 ('a2222222-2222-4222-8222-222222222222','a2020202-2020-4020-8020-202020202020','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','discovery','pending',NULL,NULL,NULL);
DO $agdiscovery$
DECLARE ok boolean; cp uuid; token uuid; n integer;
BEGIN
 SELECT checkpoint_id,claim_token INTO cp,token
 FROM public.ag_claim_cycle_stage('a2020202-2020-4020-8020-202020202020'::uuid,'discovery');
 IF cp IS DISTINCT FROM 'a2222222-2222-4222-8222-222222222222'::uuid OR token IS NULL
 THEN RAISE EXCEPTION 'Discovery stage claim identity invalid'; END IF;
 BEGIN
  PERFORM public.ag_complete_cycle_stage(cp,token,'{"discovery":{"candidates":[]},"watch_context":{"research":{},"committee":{}}}'::jsonb);
  RAISE EXCEPTION 'Incomplete Discovery handoff accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM='Incomplete Discovery handoff accepted' THEN RAISE; END IF; END;
 ok:=public.ag_complete_cycle_stage(cp,token,
 '{"discovery":{"candidates":[],"executionEvidenceInputs":{},"rateLimited":false,"stoppedEarly":false,"errors":[]},"watch_context":{"research":{},"committee":{}}}'::jsonb);
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Valid Discovery handoff did not complete'; END IF;
 SELECT count(*) INTO n FROM public.ag_read_completed_stage_output(
  'a2020202-2020-4020-8020-202020202020'::uuid,'discovery')
 WHERE stage='discovery'
   AND output->'discovery'->>'rateLimited'='false'
   AND output->'watch_context'->'research'='{}'::jsonb;
 IF n<>1 THEN RAISE EXCEPTION 'Completed Discovery output did not round-trip through authenticated RPC'; END IF;
END $agdiscovery$;
