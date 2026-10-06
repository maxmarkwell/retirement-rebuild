import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG queue producer is gated, idempotent and contains no transaction authority",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-queue.ts","utf8");
 assert.match(source,/AG_AUTONOMOUS_QUEUE_ENABLED/);assert.match(source,/idempotencyKey/);assert.match(source,/retentionSeconds:21600/);
 assert.doesNotMatch(source,/runNextAgDurabilityStep|executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});
test("AG research queue consumer advances one bounded step then explicitly re-enqueues",async()=>{
 const source=await readFile("app/api/queues/ag-autonomous-research/route.ts","utf8");
 assert.match(source,/handleCallback/);assert.match(source,/runAuthorizedAgWorkerStep/);assert.match(source,/enqueueAgResearchStep/);
 assert.match(source,/deliveryCount>=5/);assert.match(source,/acknowledge:true/);assert.match(source,/persistence_ready/);assert.match(source,/needs_review/);
 assert.doesNotMatch(source,/while\s*\(|for\s*\(|executeAgDailyCycleTransactions|daily-cycle-execution|runNextAgDurabilityStep/);
});
test("one-click route can only start autonomous continuation behind all three gates",async()=>{
 const start=await readFile("lib/discovery/accelerated-growth/autonomous-cycle-start.ts","utf8");
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 for(const gate of ["AG_AUTONOMOUS_CYCLE_ENABLED","AG_AUTONOMOUS_QUEUE_ENABLED","AG_AUTONOMOUS_WORKER_ENABLED"])assert.match(start,new RegExp(gate));
 assert.match(start,/authorizeAuthenticatedAgWorker/);assert.match(start,/enqueueAgResearchStep/);assert.match(start,/finishAgWorker/);
 assert.match(route,/startAgAutonomousResearchContinuation/);assert.match(route,/step\.action === "stage_step" \|\| step\.action === "wait"/);
 assert.doesNotMatch(start,/runNextAgDurabilityStep|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
test("Vercel config registers exactly the AG research queue topic",async()=>{
 const config=JSON.parse(await readFile("vercel.json","utf8"));
 const trigger=config.functions?.["app/api/queues/ag-autonomous-research/route.ts"]?.experimentalTriggers?.[0];
 assert.deepEqual(trigger,{type:"queue/v2beta",topic:"ag-autonomous-research-v1",retryAfterSeconds:30});
});
