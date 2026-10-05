-- Disposable tests for review-only AG symbol checkpoint candidate.
DO $t$
DECLARE bad integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='ag_cycle_symbol_checkpoints' AND c.relrowsecurity) THEN RAISE EXCEPTION 'symbol checkpoint RLS missing'; END IF;
 SELECT count(*) INTO bad FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='ag_cycle_symbol_checkpoints' AND grantee IN('anon','authenticated');
 IF bad<>0 THEN RAISE EXCEPTION 'direct symbol checkpoint client grants present'; END IF;
 SELECT count(*) INTO bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('ag_claim_cycle_symbol','ag_complete_cycle_symbol','ag_read_cycle_symbol_checkpoints') AND (has_function_privilege('public',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'));
 IF bad<>0 THEN RAISE EXCEPTION 'public/anon symbol RPC execution present'; END IF;
 SELECT count(*) INTO bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('ag_claim_cycle_symbol','ag_complete_cycle_symbol','ag_read_cycle_symbol_checkpoints') AND (NOT p.prosecdef OR coalesce(array_to_string(p.proconfig,','),'') NOT LIKE '%search_path=%' OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE'));
 IF bad<>0 THEN RAISE EXCEPTION 'symbol RPC security contract failed'; END IF;
 IF has_function_privilege('authenticated','public.ag_protect_completed_symbol_checkpoint()','EXECUTE') THEN RAISE EXCEPTION 'trigger helper client executable'; END IF;
END $t$;
