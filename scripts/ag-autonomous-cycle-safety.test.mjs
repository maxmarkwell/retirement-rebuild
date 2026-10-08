import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("autonomous AG coordinator advances only one durable unit",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-cycle-coordinator.ts","utf8");
 assert.match(source,/runNextAgResumableCycleStep/);
 assert.match(source,/runNextAgDurabilityStep/);
 assert.match(source,/outcome:"continue"/);
 assert.match(source,/outcome:"completed"/);
 assert.match(source,/outcome:"needs_review"/);
 assert.match(source,/durabilityEnabled!==true/);
 assert.match(source,/transactionsWritten:false/);
 assert.doesNotMatch(source,/while\s*\(|for\s*\(|setInterval|setTimeout|fetch\s*\(/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});

test("autonomous AG coordinator does not own scheduling transport",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-cycle-coordinator.ts","utf8");
 assert.doesNotMatch(source,/CRON_SECRET|VERCEL|queue|enqueue|after\s*\(/i);
});
