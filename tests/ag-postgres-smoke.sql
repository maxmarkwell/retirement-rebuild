-- Run only against disposable PostgreSQL with fixture and draft proposals loaded.
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.portfolios VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','paper_active',false);
INSERT INTO public.portfolio_strategy_eras VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','accelerated_growth','paper',null,now()-interval '1 day');
INSERT INTO public.ag_daily_cycles VALUES ('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',current_date,'running');
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
