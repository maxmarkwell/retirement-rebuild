import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG autonomous worker route is disabled by default and cannot transact",async()=>{
 const route=await readFile("app/api/accelerated-growth/autonomous-worker/route.ts","utf8");
 assert.match(route,/AG_AUTONOMOUS_WORKER_ENABLED/);
 assert.match(route,/x-ag-worker-secret/);
 assert.match(route,/claimAgWorker/);
 assert.match(route,/authorized_noop/);
 assert.match(route,/schedulingEnabled:false/);
 assert.match(route,/transactionsWritten:false/);
 assert.doesNotMatch(route,/runNextAgAutonomousStep|runNextAgDurabilityStep|runNextAgResumableCycleStep/);
 assert.doesNotMatch(route,/executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
 assert.doesNotMatch(route,/fetch\s*\(|after\s*\(|waitUntil|setTimeout|setInterval/);
});

test("AG worker auth adapter hashes capability tokens and constant-time checks worker secret",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-auth.ts","utf8");
 assert.match(source,/createHash\("sha256"\)/);
 assert.match(source,/randomBytes\(32\)/);
 assert.match(source,/timingSafeEqual/);
 assert.match(source,/AG_AUTONOMOUS_WORKER_SECRET/);
 assert.match(source,/ag_authorize_cycle_worker/);
 assert.match(source,/ag_claim_cycle_worker/);
 assert.match(source,/ag_finish_cycle_worker/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution/);
});
