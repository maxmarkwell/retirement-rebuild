-- READ-ONLY production preflight/postflight assertions for the AG recovery
-- migration. REVIEW before use. This file performs no DDL or DML.
-- Expected preflight values are documented in ag-production-migration-runbook.md.

SELECT current_setting('server_version') AS server_version;

SELECT extname,n.nspname AS extension_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
WHERE extname='pgcrypto';

SELECT rolname FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role')
ORDER BY rolname;

SELECT version,name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260922100000','20260924190000')
ORDER BY version;

SELECT EXISTS (
 SELECT 1 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='investment_decisions' AND column_name='notes'
) AS investment_decisions_notes_exists;

SELECT c.relname,c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
 AND c.relname IN ('ag_cycle_stage_checkpoints','ag_cycle_decision_writes','ag_cycle_watch_writes')
ORDER BY c.relname;

SELECT p.proname,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer,
       p.proconfig,
       has_function_privilege('public',p.oid,'EXECUTE') AS public_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
 AND p.proname IN (
  'ag_claim_cycle_stage','ag_complete_cycle_stage',
  'ag_read_cycle_decision_ledger','ag_read_cycle_checkpoint_status',
  'ag_read_cycle_watch_ledger','ag_read_completed_stage_output',
  'ag_commit_cycle_decision','ag_commit_watch_operation',
  'ag_verify_watch_operation_postcondition','ag_verify_cycle_watch_manifest',
  'ag_verify_committee_payload_manifest','ag_verify_holding_payload_manifest',
  'ag_complete_persistence_stage','ag_protect_completed_checkpoint')
ORDER BY p.proname;

SELECT grantee,table_name,privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
 AND table_name IN ('ag_cycle_stage_checkpoints','ag_cycle_decision_writes','ag_cycle_watch_writes')
ORDER BY table_name,grantee,privilege_type;

SELECT
 (SELECT count(*) FROM public.ag_daily_cycles) AS daily_cycles,
 (SELECT count(*) FROM public.ag_research_watchlist) AS research_watchlist,
 (SELECT count(*) FROM public.investment_decisions) AS investment_decisions,
 (SELECT count(*) FROM public.transactions) AS transactions;

-- Watchlist compatibility expected both before and after recovery migration.
SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname='ag_research_watchlist'
  AND c.conname='ag_research_watchlist_resolution_check';

-- Recovery objects must be empty immediately after schema-only application.
-- Before migration these relations are absent, so run this block postflight only.
-- SELECT
--   (SELECT count(*) FROM public.ag_cycle_stage_checkpoints) AS checkpoints,
--   (SELECT count(*) FROM public.ag_cycle_decision_writes) AS decision_writes,
--   (SELECT count(*) FROM public.ag_cycle_watch_writes) AS watch_writes;
