import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("leased worker remains separate from legacy unfenced persistence pipeline", () => {
  const store = readFileSync("lib/discovery/accelerated-growth/worker-stage-store.ts","utf8");
  const preflight = readFileSync("lib/discovery/accelerated-growth/worker-stage-preflight.ts","utf8");
  const legacy = readFileSync("lib/discovery/accelerated-growth/daily-cycle-work.ts","utf8");
  for (const path of [store, preflight]) {
    assert.doesNotMatch(path, /runAgResearchDailyCycle|persistAgResearchWatchlist|persistAgCommitteeDecisions|persistAgHoldingReviewDecisions|executeAgDailyCycleTransactions/);
  }
  for (const fn of ["persistAgResearchWatchlist","supersedeAgCommitteeWatches","persistAgHoldingReviewDecisions","persistAgCommitteeDecisions"]) {
    assert.ok(legacy.includes(fn), "audit legacy write: " + fn);
  }
  const audit = readFileSync("docs/ag-worker-persistence-fencing-audit.md","utf8");
  assert.match(audit, /NOT READY TO ACTIVATE/);
  assert.match(audit, /same transaction as the writes/);
});
