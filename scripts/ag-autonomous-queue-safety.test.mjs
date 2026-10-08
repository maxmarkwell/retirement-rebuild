import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG queue producers are gated and idempotent with durability separately gated",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-queue.ts","utf8");
 assert.match(source,/AG_AUTONOMOUS_QUEUE_ENABLED/);assert.match(source,/AG_AUTONOMOUS_DURABILITY_ENABLED/);assert.match(source,/idempotencyKey/);assert.match(source,/retentionSeconds:21600/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});
test("AG research queue advances one bounded step and hands off only at durability boundary",async()=>{
 const source=await readFile("app/api/queues/ag-autonomous-research/route.ts","utf8");
 assert.match(source,/handleCallback/);assert.match(source,/runAuthorizedAgWorkerStep/);assert.match(source,/enqueueAgResearchStep/);assert.match(source,/enqueueAgDurabilityStep/);
 assert.match(source,/deliveryCount>=5/);assert.match(source,/persistence_ready/);assert.match(source,/AG_AUTONOMOUS_DURABILITY_ENABLED/);
 assert.doesNotMatch(source,/while\s*\(|for\s*\(|executeAgDailyCycleTransactions|daily-cycle-execution|runAuthorizedAgDurabilityStep/);
});
test("AG durability queue advances one durability unit and never executes transactions",async()=>{
 const source=await readFile("app/api/queues/ag-autonomous-durability/route.ts","utf8");
 assert.match(source,/runAuthorizedAgDurabilityStep/);assert.match(source,/enqueueAgDurabilityStep/);assert.match(source,/AG_AUTONOMOUS_DURABILITY_ENABLED/);assert.match(source,/deliveryCount>=3/);
 assert.doesNotMatch(source,/while\s*\(|for\s*\(|executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});
test("one-click route can only start autonomous continuation behind all three research gates",async()=>{
 const start=await readFile("lib/discovery/accelerated-growth/autonomous-cycle-start.ts","utf8");
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 for(const gate of ["AG_AUTONOMOUS_CYCLE_ENABLED","AG_AUTONOMOUS_QUEUE_ENABLED","AG_AUTONOMOUS_WORKER_ENABLED"])assert.match(start,new RegExp(gate));
 assert.match(start,/AG_AUTONOMOUS_DURABILITY_ENABLED/);
 assert.match(start,/authorizeAuthenticatedAgWorker/);assert.match(start,/enqueueAgResearchStep/);assert.match(start,/finishAgWorker/);
 assert.match(route,/startAgAutonomousResearchContinuation/);assert.match(route,/step\.action === "stage_step" \|\| step\.action === "wait"/);
 assert.doesNotMatch(start,/runNextAgDurabilityStep|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
test("Vercel config registers isolated research and durability queue topics",async()=>{
 const config=JSON.parse(await readFile("vercel.json","utf8"));
 assert.deepEqual(config.functions?.["app/api/queues/ag-autonomous-research/route.ts"]?.experimentalTriggers?.[0],{type:"queue/v2beta",topic:"ag-autonomous-research-v1",retryAfterSeconds:30});
 assert.deepEqual(config.functions?.["app/api/queues/ag-autonomous-durability/route.ts"]?.experimentalTriggers?.[0],{type:"queue/v2beta",topic:"ag-autonomous-durability-v1",retryAfterSeconds:60});
});

test("autonomous cycle start fails closed when durability is unavailable",async()=>{
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 const guard=route.indexOf("AG research durability is disabled; refusing to start");
 const start=route.indexOf("await runNextAgResumableCycleStep");
 assert.ok(guard>0 && guard<start);
 assert.ok(route.includes('AG_AUTONOMOUS_DURABILITY_ENABLED === "true"'));
 assert.ok(route.includes('AG_RESUMABLE_DURABILITY_ENABLED !== "true"'));
});

test("disabled durability handoff throws and revokes after bounded retries",async()=>{
 const route=await readFile("app/api/queues/ag-autonomous-research/route.ts","utf8");
 assert.ok(route.includes('AG durability consumer disabled at research handoff'));
 assert.ok(route.includes('if(metadata.deliveryCount>=5)try{await finishAgWorker'));
});

test("in-flight queue shutdowns do not silently acknowledge either stage",async()=>{
 const research=await readFile("app/api/queues/ag-autonomous-research/route.ts","utf8");
 const durability=await readFile("app/api/queues/ag-autonomous-durability/route.ts","utf8");
 assert.ok(research.includes("AG research queue or worker disabled during an active cycle"));
 assert.ok(durability.includes("AG durability queue or worker disabled during an active cycle"));
 assert.ok(research.indexOf("if(!valid(message))")<research.indexOf("AG research queue or worker disabled"));
 assert.ok(durability.indexOf("if(!valid(message))")<durability.indexOf("AG durability queue or worker disabled"));
});
