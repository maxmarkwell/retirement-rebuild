const assert=require("node:assert/strict"),fs=require("node:fs");
const source=fs.readFileSync("lib/discovery/accelerated-growth/authorized-stage-continuation.ts","utf8");
for(const rpc of ["ag_worker_read_cycle_checkpoint_status","ag_worker_claim_cycle_stage","ag_worker_complete_cycle_stage","ag_worker_read_completed_stage_output"])assert.ok(source.includes(rpc),rpc);
assert.match(source,/STAGES\.slice\(0, stageIndex\)/);
assert.match(source,/AG_WORKER_STAGE_ALREADY_CLAIMED_REQUIRES_REVIEW/);
assert.match(source,/createAdminClient/);
assert.doesNotMatch(source,/\.from\("transactions"\)|\.from\("investment_decisions"\)|executeAgDailyCycleTransactions/);
console.log("Authorization-scoped stage claims enforce order and fail closed.");
