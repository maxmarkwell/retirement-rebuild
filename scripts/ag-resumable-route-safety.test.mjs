import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("resumable AG route stays double-gated and research-only",async()=>{
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 assert.match(route,/AG_DAILY_CYCLE_RUNS_ENABLED/);
 assert.match(route,/AG_RESUMABLE_RESEARCH_RUNNER_ENABLED/);
 assert.match(route,/runNextAgResumableCycleStep/);
 assert.doesNotMatch(route,/persistence-stage-executor|persistence-stage-supabase/);
 assert.doesNotMatch(route,/daily-cycle-execution/);
});

test("resumable coordinator cannot persist or execute transactions",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/resumable-cycle-orchestrator.ts","utf8");
 assert.match(source,/paper_active/);
 assert.match(source,/is_real_money",false/);
 assert.match(source,/runNextAgResumableResearchStage/);
 assert.match(source,/transactionsWritten:false/);
 assert.doesNotMatch(source,/executeAgPersistenceStage|createAuthenticatedAgPersistenceIo/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution/);
 assert.doesNotMatch(source,/status:"completed"/);
});
