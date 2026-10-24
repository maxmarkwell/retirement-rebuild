import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = process.cwd();
const cycle = readFileSync(root + "/lib/discovery/accelerated-growth/daily-cycle.ts", "utf8");
const status = readFileSync(root + "/lib/discovery/accelerated-growth/daily-cycle-status.ts", "utf8");
const route = readFileSync(root + "/app/api/accelerated-growth/daily-cycle/route.ts", "utf8");
const work = readFileSync(root + "/lib/discovery/accelerated-growth/daily-cycle-work.ts", "utf8");

test("prior running cycle blocks cross-day discovery before insert", () => {
  const guard = cycle.indexOf('if ((priorRunning.data?.length ?? 0) > 0)');
  const insert = cycle.indexOf('.from("ag_daily_cycles").insert(');
  assert.ok(guard > 0 && insert > guard);
  assert.match(cycle, /previous_cycle_requires_reconciliation/);
});
test("production route exposes a conflict and never activates trading", () => {
  assert.match(route, /previous_cycle_requires_reconciliation" \? 409 : 200/);
  assert.match(route, /executeTransactions: false/);
  assert.match(work, /AG_PAPER_EXECUTION_DISABLED/);
});
test("status includes prior-cycle stall and reconciliation information", () => {
  assert.match(status, /previousCycleStalled/);
  assert.match(status, /previous_cycle_requires_reconciliation/);
  assert.match(status, /previousCycleReconciliation/);
  assert.match(status, /automaticRetryPermitted: false/);
});
test("synchronous route remains a known end-to-end release blocker", () => {
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /await runAgResearchDailyCycle/);
});
