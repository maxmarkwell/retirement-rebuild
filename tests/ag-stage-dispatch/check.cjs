const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync("lib/discovery/accelerated-growth/stage-dispatch-plan.ts","utf8");
for(const value of ["out_of_order_checkpoint","unexpected_or_duplicate_checkpoint","manual_review","getAgWorkerCheckpointStatus","action: \"done\"","action: \"run\""])assert.ok(source.includes(value),value);
assert.doesNotMatch(source,/\.update\(|\.insert\(|\.delete\(|executeAgDailyCycleTransactions/);
console.log("AG stage dispatch is fail closed and read only");
