import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG queue wakes do not consume productive invocation budget",async()=>{
 const auth=await readFile("lib/discovery/accelerated-growth/autonomous-worker-auth.ts","utf8");
 const step=await readFile("lib/discovery/accelerated-growth/autonomous-worker-step.ts","utf8");
 const queue=await readFile("lib/discovery/accelerated-growth/autonomous-queue.ts","utf8");
 const route=await readFile("app/api/queues/ag-autonomous-research/route.ts","utf8");
 const sql=await readFile("supabase/migration-candidates/20261007_ag_worker_productive_invocation_budget.sql","utf8");
 assert.match(auth,/ag_validate_cycle_worker/);
 assert.match(auth,/ag_charge_cycle_worker_invocation/);
 assert.match(step,/if\(step\.executedStage\)/);
 assert.match(step,/chargeAgWorkerInvocation/);
 assert.match(queue,/wakeSequence\?:number/);
 assert.match(queue,/research:\$\{sequence\}/);
 assert.match(route,/nextWakeSequence=\(message\.wakeSequence\?\?1\)\+1/);
 assert.match(sql,/create or replace function public\.ag_validate_cycle_worker/);
 assert.match(sql,/create or replace function public\.ag_charge_cycle_worker_invocation/);
 assert.doesNotMatch(sql.match(/ag_validate_cycle_worker[\s\S]*?end \$\$/)?.[0]??"",/invocation_count=invocation_count\+1/);
 assert.match(sql.match(/ag_charge_cycle_worker_invocation[\s\S]*?end \$\$/)?.[0]??"",/invocation_count=invocation_count\+1/);
});
