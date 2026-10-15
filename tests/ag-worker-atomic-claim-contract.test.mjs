import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(process.cwd() + "/supabase/migrations/20261015020000_ag_worker_atomic_claim_guards.sql", "utf8");

test("claim serializes by locking the authoritative cycle", () => {
  assert.match(sql, /from public\.ag_daily_cycles\s+where id=p_cycle_id and status='running' for update/);
  assert.match(sql, /AG_WORKER_CYCLE_NOT_RUNNING/);
});
test("claim verifies paper-only scope and protects unfinished prior-day cycles", () => {
  assert.match(sql, /p\.is_real_money=false/);
  assert.match(sql, /e\.execution_mode='paper'/);
  assert.match(sql, /e\.ended_at is null/);
  assert.match(sql, /older\.cycle_date<v_cycle\.cycle_date/);
  assert.match(sql, /AG_WORKER_PREVIOUS_CYCLE_REQUIRES_RECONCILIATION/);
});
test("claim atomically verifies durable predecessor outputs", () => {
  assert.match(sql, /foreach v_prior in array v_stages\[1:v_index-1\] loop/);
  assert.match(sql, /cp\.status='completed' and cp\.output is not null/);
  assert.match(sql, /AG_WORKER_PREDECESSOR_NOT_DURABLE/);
});
test("claim never automatically retries an existing stage", () => {
  assert.match(sql, /if found then\s+-- No automatic retry or takeover/);
  assert.match(sql, /AG_WORKER_RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(sql, /update public\.ag_daily_cycles|delete from public\.ag_daily_cycles/);
});
test("claim RPC remains service-role-only", () => {
  assert.match(sql, /auth\.role\(\) <> 'service_role'/);
  assert.match(sql, /revoke all on function public\.ag_worker_claim_stage/);
  assert.match(sql, /grant execute on function public\.ag_worker_claim_stage\([^;]+to service_role;/s);
});
