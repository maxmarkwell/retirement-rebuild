import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(root + "/supabase/migrations/20261015010000_ag_worker_stage_leases.sql", "utf8");
const route = readFileSync(root + "/app/api/accelerated-growth/daily-cycle/route.ts", "utf8");
const work = readFileSync(root + "/lib/discovery/accelerated-growth/daily-cycle-work.ts", "utf8");

test("stage lease RPCs require service role and reject invalid stages", () => {
  for (const name of ["claim", "renew", "complete"]) {
    assert.match(migration, new RegExp("create or replace function public\\.ag_worker_" + name + "_stage\\("));
    assert.match(migration, new RegExp("revoke all on function public\\.ag_worker_" + name + "_stage\\("));
    assert.match(migration, new RegExp("grant execute on function public\\.ag_worker_" + name + "_stage\\([^;]+to service_role;", "s"));
  }
  assert.equal((migration.match(/auth\.role\(\) <> 'service_role'/g) ?? []).length, 3);
  assert.match(migration, /AG_WORKER_INVALID_STAGE/);
});

test("claim refuses automatic recovery of expired or failed work", () => {
  assert.match(migration, /AG_WORKER_RECONCILIATION_REQUIRED/);
  assert.match(migration, /v_stage\.status in \('running','failed'\)/);
  assert.match(migration, /AG_WORKER_STAGE_NOT_CLAIMABLE/);
});

test("renewal and completion fence writes with token and live lease", () => {
  assert.equal((migration.match(/claim_token=p_token/g) ?? []).length, 2);
  assert.equal((migration.match(/lease_expires_at>now\(\)/g) ?? []).length, 2);
  assert.ok((migration.match(/and status='running' and lease_expires_at>now\(\)/g) ?? []).length >= 2);
});

test("existing synchronous research route remains disabled pending durable orchestration", () => {
  assert.match(route, /await runAgResearchDailyCycle/);
  assert.match(route, /executeTransactions: false/);
  assert.match(work, /AG_PAPER_EXECUTION_DISABLED/);
});
