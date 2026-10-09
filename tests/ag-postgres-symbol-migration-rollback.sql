-- Candidate failure must roll back every symbol-checkpoint object atomically.
DO $t$
BEGIN
 IF to_regclass('public.ag_cycle_symbol_checkpoints') IS NOT NULL THEN RAISE EXCEPTION 'symbol checkpoint table survived failed candidate'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('ag_protect_completed_symbol_checkpoint','ag_complete_cycle_symbol','ag_read_cycle_symbol_checkpoints')) THEN RAISE EXCEPTION 'symbol checkpoint function survived failed candidate'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='ag_symbol_checkpoint_immutable' AND NOT tgisinternal) THEN RAISE EXCEPTION 'symbol checkpoint trigger survived failed candidate'; END IF;
END $t$;
