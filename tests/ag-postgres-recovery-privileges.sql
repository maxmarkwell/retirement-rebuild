-- Disposable migration-candidate privilege assertions. Never run against production.
DO $agpriv$
DECLARE
  bad_count integer;
BEGIN
  SELECT count(*) INTO bad_count
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN ('ag_cycle_stage_checkpoints','ag_cycle_decision_writes','ag_cycle_watch_writes')
    AND grantee IN ('anon','authenticated');
  IF bad_count<>0 THEN RAISE EXCEPTION 'Recovery tables grant direct anon/authenticated access'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='ag_cycle_stage_checkpoints' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='ag_cycle_decision_writes' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='ag_cycle_watch_writes' AND c.relrowsecurity
  ) THEN RAISE EXCEPTION 'Recovery table RLS missing'; END IF;

  SELECT count(*) INTO bad_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'ag_%'
    AND p.prosecdef
    AND coalesce(array_to_string(p.proconfig,','),'') NOT LIKE '%search_path=%';
  IF bad_count<>0 THEN RAISE EXCEPTION 'AG SECURITY DEFINER function missing fixed search_path'; END IF;

  SELECT count(*) INTO bad_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN (
      'ag_claim_cycle_stage','ag_complete_cycle_stage',
      'ag_read_cycle_decision_ledger','ag_read_cycle_checkpoint_status',
      'ag_read_cycle_watch_ledger','ag_read_completed_stage_output',
      'ag_commit_cycle_decision','ag_commit_watch_operation',
      'ag_verify_watch_operation_postcondition','ag_verify_cycle_watch_manifest',
      'ag_verify_committee_payload_manifest','ag_verify_holding_payload_manifest',
      'ag_complete_persistence_stage')
    AND has_function_privilege('public',p.oid,'EXECUTE');
  IF bad_count<>0 THEN RAISE EXCEPTION 'Recovery function remains executable by PUBLIC'; END IF;
END $agpriv$;


-- Enforce the exact authenticated privileged API surface. Trigger-only helpers
-- must not become authenticated RPC endpoints.
DO $agapisurface$
DECLARE actual text[]; expected text[] := ARRAY[
 'ag_claim_cycle_stage','ag_commit_cycle_decision','ag_commit_watch_operation',
 'ag_complete_cycle_stage','ag_complete_persistence_stage',
 'ag_read_completed_stage_output','ag_read_cycle_checkpoint_status',
 'ag_read_cycle_decision_ledger','ag_read_cycle_watch_ledger',
 'ag_verify_committee_payload_manifest','ag_verify_cycle_watch_manifest',
 'ag_verify_holding_payload_manifest','ag_verify_watch_operation_postcondition'
]::text[];
BEGIN
 SELECT array_agg(DISTINCT p.proname ORDER BY p.proname) INTO actual
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'ag_%'
   AND p.prosecdef
   AND has_function_privilege('authenticated',p.oid,'EXECUTE');
 SELECT array_agg(x ORDER BY x) INTO expected FROM unnest(expected) x;
 IF actual IS DISTINCT FROM expected THEN
   RAISE EXCEPTION 'Unexpected authenticated AG SECURITY DEFINER surface: % expected %',actual,expected;
 END IF;
 IF has_function_privilege('authenticated','public.ag_protect_completed_checkpoint()','EXECUTE')
 THEN RAISE EXCEPTION 'Trigger-only checkpoint guard is authenticated-executable'; END IF;
END $agapisurface$;


DO $aganonrpc$
DECLARE bad_count integer;
BEGIN
 SELECT count(*) INTO bad_count
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN (
    'ag_claim_cycle_stage','ag_complete_cycle_stage',
    'ag_read_cycle_decision_ledger','ag_read_cycle_checkpoint_status',
    'ag_read_cycle_watch_ledger','ag_read_completed_stage_output',
    'ag_commit_cycle_decision','ag_commit_watch_operation',
    'ag_verify_watch_operation_postcondition','ag_verify_cycle_watch_manifest',
    'ag_verify_committee_payload_manifest','ag_verify_holding_payload_manifest',
    'ag_complete_persistence_stage')
   AND has_function_privilege('anon',p.oid,'EXECUTE');
 IF bad_count<>0 THEN
   RAISE EXCEPTION 'Anonymous role can execute % AG recovery RPCs',bad_count;
 END IF;
END $aganonrpc$;
