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
