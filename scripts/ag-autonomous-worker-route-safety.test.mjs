import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG autonomous worker route is gated and delegates one bounded step",async()=>{
 const route=await readFile("app/api/accelerated-growth/autonomous-worker/route.ts","utf8");
 assert.match(route,/AG_AUTONOMOUS_WORKER_ENABLED/);assert.match(route,/x-ag-worker-secret/);assert.match(route,/runAuthorizedAgWorkerStep/);
 assert.match(route,/schedulingEnabled:false/);assert.match(route,/transactionsWritten:false/);
 assert.doesNotMatch(route,/runNextAgDurabilityStep|executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
 assert.doesNotMatch(route,/fetch\s*\(|after\s*\(|waitUntil|setTimeout|setInterval/);
});
test("AG bounded worker step owns research execution but no scheduling or durability",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-step.ts","utf8");
 assert.match(source,/claimAgWorker/);assert.match(source,/createWorkerAgExecutionContext/);assert.match(source,/runNextAgResumableResearchStage/);assert.match(source,/finishAgWorker/);
 assert.match(source,/persistence_ready/);assert.match(source,/transactionsWritten:false/);
 assert.doesNotMatch(source,/@vercel\/queue|enqueueAgResearchStep|runNextAgDurabilityStep|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
test("AG worker context uses only cycle-scoped worker RPCs",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-context.ts","utf8");
 assert.match(source,/createAdminClient/);assert.match(source,/AG worker cycle mismatch/);
 for(const name of ["ag_worker_read_cycle_checkpoint_status","ag_worker_read_completed_stage_output","ag_worker_claim_cycle_stage","ag_worker_complete_cycle_stage","ag_worker_read_cycle_symbol_checkpoints","ag_worker_claim_cycle_symbol","ag_worker_complete_cycle_symbol","ag_worker_reclaim_expired_symbol_parent_stage"])assert.match(source,new RegExp(name));
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});
test("AG worker auth adapter hashes capability tokens and constant-time checks worker secret",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-auth.ts","utf8");
 assert.match(source,/createHash\("sha256"\)/);assert.match(source,/randomBytes\(32\)/);assert.match(source,/timingSafeEqual/);assert.match(source,/AG_AUTONOMOUS_WORKER_SECRET/);
 assert.match(source,/ag_authorize_cycle_worker/);assert.match(source,/ag_claim_cycle_worker/);assert.match(source,/ag_finish_cycle_worker/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution/);
});
