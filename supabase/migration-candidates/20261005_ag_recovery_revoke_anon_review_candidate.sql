-- REVIEW CANDIDATE ONLY. Follow-up privilege hardening after
-- 20261005174550_ag_recovery_atomic_persistence.
-- Live Supabase default privileges granted anon EXECUTE explicitly on newly
-- created public functions. Restrict only the reviewed AG recovery RPC set.
BEGIN;

DO $ag_revoke_anon$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'ag_claim_cycle_stage',
        'ag_complete_cycle_stage',
        'ag_read_cycle_decision_ledger',
        'ag_read_cycle_checkpoint_status',
        'ag_read_cycle_watch_ledger',
        'ag_read_completed_stage_output',
        'ag_commit_cycle_decision',
        'ag_commit_watch_operation',
        'ag_verify_watch_operation_postcondition',
        'ag_verify_cycle_watch_manifest',
        'ag_verify_committee_payload_manifest',
        'ag_verify_holding_payload_manifest',
        'ag_complete_persistence_stage'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);
  END LOOP;
END $ag_revoke_anon$;

COMMIT;
