import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(process.cwd() + "/supabase/migrations/20261015030000_ag_worker_output_identity_guards.sql", "utf8");

test("database checks version, cycle, stage and nonempty payload", () => {
  assert.match(sql, /p_output->>'schemaVersion' is distinct from '1'/);
  assert.match(sql, /p_output->>'cycleId' is distinct from p_cycle_id::text/);
  assert.match(sql, /p_output->>'stage' is distinct from p_stage/);
  assert.match(sql, /p_output->'payload' = '\{\}'::jsonb/);
  assert.match(sql, /AG_WORKER_OUTPUT_INVALID/);
});
test("completion requires valid claim and running cycle", () => {
  assert.match(sql, /claim_token=p_token/);
  assert.match(sql, /lease_expires_at>now\(\)/);
  assert.match(sql, /where id=p_cycle_id and status='running'/);
});
test("completion is service-role-only and does not modify cycle state", () => {
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(sql, /grant execute on function public\.ag_worker_complete_stage\([^;]+to service_role;/s);
  assert.doesNotMatch(sql, /update public\.ag_daily_cycles|delete from public\.ag_daily_cycles/);
});
