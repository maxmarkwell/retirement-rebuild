import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const store = readFileSync(process.cwd() + "/lib/discovery/accelerated-growth/worker-stage-store.ts", "utf8");

test("worker store checks authoritative cycle and paper-era scope before lease", () => {
  assert.match(store, /from\("ag_daily_cycles"\)/);
  assert.match(store, /from\("portfolios"\)/);
  assert.match(store, /from\("portfolio_strategy_eras"\)/);
  assert.match(store, /assertAgWorkerCycleScope/);
  assert.match(store, /assertAgWorkerStageEligible/);
  assert.match(store, /era\.ended_at !== null/);
  assert.match(store, /hasEarlierUnfinishedCycle: previous\.length > 0/);
});

test("worker store only claims and completes through service-role RPC", () => {
  assert.match(store, /createAdminClient/);
  assert.match(store, /admin\.rpc\("ag_worker_claim_stage"/);
  assert.match(store, /admin\.rpc\("ag_worker_complete_stage"/);
  assert.match(store, /p_token: input\.claimToken/);
  assert.match(store, /data !== true/);
});

test("worker store cannot execute transactions or mutate cycle state", () => {
  assert.doesNotMatch(store, /executeAgPaperBuy|executeAgDailyCycleTransactions|executeTransactions/);
  assert.doesNotMatch(store, /\.insert\(|\.update\(|\.delete\(/);
});
