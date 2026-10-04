#!/usr/bin/env bash
# Disposable PostgreSQL only. Execute after ag-postgres-smoke.sql.
set -euo pipefail
cycle='44444444-4444-4444-8444-444444444444'
claim='55555555-5555-4555-8555-555555555555'
user='11111111-1111-4111-8111-111111111111'
call="SELECT public.ag_commit_cycle_decision('$cycle','$claim','RACE','committee','watch','Concurrent thesis',75,'short',null,null,null,null,null)"
# Worker one keeps its transaction open after writing, forcing worker two
# to wait on the same cycle row and then resolve the committed retry.
psql -v ON_ERROR_STOP=1 -c "BEGIN; SELECT set_config('request.jwt.claim.sub','$user',true); $call; SELECT pg_sleep(2); COMMIT;" > /tmp/ag-worker-one.log 2>&1 &
first=$!
sleep 0.5
psql -v ON_ERROR_STOP=1 -c "BEGIN; SELECT set_config('request.jwt.claim.sub','$user',true); $call; COMMIT;" > /tmp/ag-worker-two.log 2>&1 &
second=$!
wait "$first" || { cat /tmp/ag-worker-one.log; exit 1; }
wait "$second" || { cat /tmp/ag-worker-two.log; exit 1; }
psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
 IF (SELECT count(*) FROM public.ag_cycle_decision_writes WHERE ticker='RACE' AND status='committed') <> 1
 THEN RAISE EXCEPTION 'Concurrent calls did not yield one committed ledger row'; END IF;
 IF (SELECT count(*) FROM public.investment_decisions WHERE ticker='RACE' AND status='active') <> 1
 THEN RAISE EXCEPTION 'Concurrent calls did not yield one active decision'; END IF;
END $$;
SQL
echo 'Concurrent AG retry test passed'
