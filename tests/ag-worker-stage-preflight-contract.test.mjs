import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preflight = readFileSync(process.cwd() + "/lib/discovery/accelerated-growth/worker-stage-preflight.ts", "utf8");

test("worker preflight scopes cycle, portfolio and era before eligibility", () => {
  assert.match(preflight, /createAdminClient/);
  assert.match(preflight, /\.eq\("id", input\.cycleId\)/);
  assert.match(preflight, /AG_WORKER_PORTFOLIO_CONTEXT_MISMATCH/);
  assert.match(preflight, /AG_WORKER_ERA_CONTEXT_MISMATCH/);
  assert.match(preflight, /assertAgWorkerCycleScope/);
  assert.match(preflight, /assertAgWorkerStageEligible/);
});
test("worker preflight blocks previous unfinished cycles and checks checkpoint ownership", () => {
  assert.match(preflight, /\.lt\("cycle_date", cycle\.cycle_date\)/);
  assert.match(preflight, /hasEarlierUnfinishedCycle/);
  assert.match(preflight, /\.eq\("strategy_era_id", cycle\.strategy_era_id\)/);
  assert.match(preflight, /AG_WORKER_CHECKPOINT_READ_FAILED/);
});
test("preflight is read-only, never claims leases or trades", () => {
  assert.doesNotMatch(preflight, /\.insert\(|\.update\(|\.delete\(|\.rpc\(|executeAgPaperBuy|executeAgDailyCycleTransactions/);
});
