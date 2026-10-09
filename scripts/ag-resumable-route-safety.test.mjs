import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("resumable AG route stays double-gated and research-only",async()=>{
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 assert.match(route,/AG_DAILY_CYCLE_RUNS_ENABLED/);
 assert.match(route,/AG_RESUMABLE_RESEARCH_RUNNER_ENABLED/);
 assert.match(route,/runNextAgResumableCycleStep/);
 assert.match(route,/AG_RESUMABLE_DURABILITY_ENABLED/);
 assert.match(route,/runNextAgDurabilityStep/);
 assert.doesNotMatch(route,/persistence-stage-executor|persistence-stage-supabase|cycle-finalization-supabase/);
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


test("durability coordinator is paper-only and cannot execute transactions",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/resumable-durability-orchestrator.ts","utf8");
 assert.match(source,/paper_active/);
 assert.match(source,/is_real_money",false/);
 assert.match(source,/executeAgPersistenceStage/);
 assert.match(source,/createAuthenticatedAgCycleFinalizationIo/);
 assert.match(source,/transactionsWritten:false/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});


test("expired symbol-parent recovery stays narrow and cannot bypass active leases",async()=>{
 const adapter=await readFile("lib/discovery/accelerated-growth/resumable-daily-cycle-adapter.ts","utf8");
 const transport=await readFile("lib/discovery/accelerated-growth/stage-checkpoint-supabase.ts","utf8");
 const migration=await readFile("supabase/migration-candidates/20261005_ag_symbol_parent_reclaim_review_candidate.sql","utf8");
 assert.match(adapter,/reclaimAuthenticatedAgExpiredSymbolParent/);
 assert.match(adapter,/reclaimedSymbolParent/);
 assert.match(adapter,/!reclaimedSymbolParent/);
 assert.match(transport,/ag_reclaim_expired_symbol_parent_stage/);
 assert.match(migration,/p_stage NOT IN \('catalyst_deep_research','committee'\)/);
 assert.match(migration,/lease_expires_at>=now\(\)/);
 assert.match(migration,/status IN \('running','failed','needs_manual_review'\)/);
 assert.match(migration,/p\.is_real_money=false/);
 assert.match(migration,/e\.execution_mode='paper'/);
 assert.doesNotMatch(adapter,/executeAgDailyCycleTransactions|daily-cycle-execution/);
});


test("resumable coordinator safely reuses one prior-date running cycle",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/resumable-cycle-orchestrator.ts","utf8");
 assert.match(source,/\.eq\("status","running"\)\.limit\(2\)/);
 assert.match(source,/length>1/);
 assert.match(source,/priorRunning/);
 assert.match(source,/Conflicting AG cycle state requires manual reconciliation/);
 assert.match(source,/resumableExisting=priorRunning\?\?existing/);
 assert.match(source,/authoritativeCycleDate/);
 assert.doesNotMatch(source,/executeAgDailyCycleTransactions|daily-cycle-execution/);
});
