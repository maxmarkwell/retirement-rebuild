import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
test("artifact write fences token and cycle in one database transaction", () => {
 const sql=readFileSync("supabase/migrations/20261015040000_ag_worker_fenced_stage_artifacts.sql","utf8");
 for(const required of ["AG_WORKER_PROTECTED_CYCLE","auth.role() <> 'service_role'","for update","claim_token is distinct from p_token","lease_expires_at <= clock_timestamp()","status='running'","on conflict do nothing","revoke all on public.ag_worker_stage_artifacts"]) {
  assert.ok(sql.includes(required),required);
 }
 const reads=readFileSync("supabase/migrations/20261015050000_ag_worker_fenced_artifact_reads.sql","utf8");
 for(const required of ["AG_WORKER_PROTECTED_CYCLE","for update","claim_token is distinct from p_token","lease_expires_at <= clock_timestamp()","a.user_id=v_cycle.user_id","a.portfolio_id=v_cycle.portfolio_id","a.strategy_era_id=v_cycle.strategy_era_id"]) {
  assert.ok(reads.includes(required),required);
 }
 const runner=readFileSync("tests/fixtures/run-ag-worker-postgres.sh","utf8");
 assert.ok(runner.includes("ag-worker-fenced-artifacts-assertions.sql"));
 assert.ok(runner.includes("20261015050000_ag_worker_fenced_artifact_reads.sql"));
});
