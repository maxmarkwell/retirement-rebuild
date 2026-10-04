-- Run only against disposable PostgreSQL with fixture and draft proposals loaded.
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.portfolios VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','paper_active',false);
INSERT INTO public.portfolio_strategy_eras VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','accelerated_growth','paper',null,now()-interval '1 day');
INSERT INTO public.ag_daily_cycles VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',current_date,'running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,output)
VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','committee','completed','{}'::jsonb);
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at)
VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','persistence','running','55555555-5555-4555-8555-555555555555',now()+interval '10 minutes');
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $$
DECLARE first_id uuid; retry_id uuid; count_rows integer;
BEGIN
 first_id := public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','TEST','committee','watch','A research thesis',75,'short',null,null,null,null,null);
 retry_id := public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','TEST','committee','watch','A research thesis',75,'short',null,null,null,null,null);
 IF first_id IS NULL OR retry_id IS DISTINCT FROM first_id THEN RAISE EXCEPTION 'Idempotent retry failed'; END IF;
 SELECT count(*) INTO count_rows FROM public.investment_decisions WHERE ticker='TEST' AND status='active';
 IF count_rows <> 1 THEN RAISE EXCEPTION 'Duplicate active decisions'; END IF;
 BEGIN
  PERFORM public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','TEST','committee','watch','Changed thesis',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Conflicting retry unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Conflicting retry unexpectedly accepted' THEN RAISE; END IF;
 END;
END $$;
-- Expired lease must reject a fresh ticker without writing anything.
UPDATE public.ag_cycle_stage_checkpoints SET lease_expires_at=now()-interval '1 minute';
DO $$ BEGIN
 BEGIN
  PERFORM public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','LATE','committee','watch','Late thesis',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Expired lease unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Expired lease unexpectedly accepted' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='LATE') THEN RAISE EXCEPTION 'Expired lease created ledger row'; END IF;
END $$;

-- Unauthorized callers must not write decisions or ledger rows.
SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false);
DO $$ BEGIN
 BEGIN
  PERFORM public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','OTHER','committee','watch','Unauthorized',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Cross-user write unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Cross-user write unexpectedly accepted' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='OTHER') THEN RAISE EXCEPTION 'Cross-user ledger write'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

-- A real-money flag must block persistence even with a valid cycle and claim.
UPDATE public.ag_cycle_stage_checkpoints SET lease_expires_at=now()+interval '10 minutes';
UPDATE public.portfolios SET is_real_money=true;
DO $$ BEGIN
 BEGIN
  PERFORM public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','REAL','committee','watch','Must reject',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Real-money write unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Real-money write unexpectedly accepted' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='REAL') THEN RAISE EXCEPTION 'Real-money ledger write'; END IF;
END $$;
UPDATE public.portfolios SET is_real_money=false;

-- Force the decision INSERT to fail after supersession. Both the prior active
-- decision and ledger must remain unchanged when the RPC transaction aborts.
INSERT INTO public.investment_decisions(user_id,portfolio_id,ticker,decision_type,source,status,thesis,created_at)
VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','ROLL','hold','ai_committee','active','Existing decision',now());
ALTER TABLE public.investment_decisions ADD CONSTRAINT ag_test_reject_new_thesis CHECK (thesis <> 'Force insert rollback');
DO $$ BEGIN
 BEGIN
  PERFORM public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','ROLL','committee','watch','Force insert rollback',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Failed insert unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Failed insert unexpectedly accepted' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.investment_decisions WHERE ticker='ROLL' AND status='active') <> 1
    OR (SELECT count(*) FROM public.investment_decisions WHERE ticker='ROLL' AND status='superseded') <> 0
 THEN RAISE EXCEPTION 'Supersession did not roll back'; END IF;
 IF EXISTS(SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='ROLL') THEN RAISE EXCEPTION 'Failed insert left ledger write'; END IF;
END $$;

-- An older delayed cycle cannot overwrite a ticker committed by a newer cycle.
-- Build two additional running cycles in the same strategy era.
INSERT INTO public.ag_daily_cycles VALUES
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',current_date-interval '2 days','running'),
 ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',current_date-interval '1 day','running');
INSERT INTO public.ag_cycle_stage_checkpoints(cycle_id,user_id,portfolio_id,strategy_era_id,stage,status,claim_token,lease_expires_at)
VALUES
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','persistence','running','88888888-8888-4888-8888-888888888888',now()+interval '10 minutes'),
 ('77777777-7777-4777-8777-777777777777','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','persistence','running','99999999-9999-4999-8999-999999999999',now()+interval '10 minutes');
DO $$
DECLARE newer_id uuid;
BEGIN
 newer_id := public.ag_commit_cycle_decision('77777777-7777-4777-8777-777777777777','99999999-9999-4999-8999-999999999999','FENCE','committee','watch','Newer cycle thesis',75,'short',null,null,null,null,null);
 IF newer_id IS NULL THEN RAISE EXCEPTION 'Newer cycle failed to commit'; END IF;
 BEGIN
  PERFORM public.ag_commit_cycle_decision('66666666-6666-4666-8666-666666666666','88888888-8888-4888-8888-888888888888','FENCE','committee','avoid','Older stale thesis',75,'short',null,null,null,null,null);
  RAISE EXCEPTION 'Older cycle unexpectedly overwrote newer decision';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'Older cycle unexpectedly overwrote newer decision' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.investment_decisions WHERE ticker='FENCE' AND status='active' AND id=newer_id) <> 1
 THEN RAISE EXCEPTION 'Newer cycle decision was altered'; END IF;
 IF EXISTS(SELECT 1 FROM public.ag_cycle_decision_writes WHERE ticker='FENCE' AND cycle_id='66666666-6666-4666-8666-666666666666')
 THEN RAISE EXCEPTION 'Older cycle left ledger entry'; END IF;
END $$;

-- Simulate a process that commits its first decision, disappears, and resumes
-- with a fresh request using the same stage claim and identical payloads.
DO $$
DECLARE first_id uuid; retry_id uuid; second_id uuid;
BEGIN
 first_id := public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','BATCHA','committee','watch','First batch item',70,'short',null,null,null,null,null);
 IF first_id IS NULL THEN RAISE EXCEPTION 'First batch decision missing'; END IF;
END $$;
-- Separate SQL statements represent independent committed client requests.
DO $$
DECLARE first_id uuid; retry_id uuid; second_id uuid;
BEGIN
 SELECT investment_decision_id INTO first_id FROM public.ag_cycle_decision_writes
 WHERE cycle_id='44444444-4444-4444-8444-444444444444' AND ticker='BATCHA';
 retry_id := public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','BATCHA','committee','watch','First batch item',70,'short',null,null,null,null,null);
 second_id := public.ag_commit_cycle_decision('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','BATCHB','committee','watch','Second batch item',70,'short',null,null,null,null,null);
 IF retry_id IS DISTINCT FROM first_id OR second_id IS NULL THEN RAISE EXCEPTION 'Interrupted batch resume failed'; END IF;
 IF (SELECT count(*) FROM public.ag_cycle_decision_writes WHERE ticker IN ('BATCHA','BATCHB') AND status='committed') <> 2
 THEN RAISE EXCEPTION 'Interrupted batch ledger incomplete'; END IF;
 IF (SELECT count(*) FROM public.investment_decisions WHERE ticker IN ('BATCHA','BATCHB') AND status='active') <> 2
 THEN RAISE EXCEPTION 'Interrupted batch produced duplicate or missing active decisions'; END IF;
END $$;
