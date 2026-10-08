import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG autonomous durability step is bounded, paper-capability scoped and transaction-free",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-durability-step.ts","utf8");
 assert.match(source,/claimAgWorker/);assert.match(source,/executeAgPersistenceStage/);assert.match(source,/finishAgWorker/);assert.match(source,/cycle_finalized/);
 assert.doesNotMatch(source,/while\s*\(|for\s*\(|executeAgDailyCycleTransactions|daily-cycle-execution|ag_execution_authorizations|ag_sell_execution_authorizations/);
});
test("AG worker durability IO uses only worker-scoped RPC wrappers",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/autonomous-worker-durability-context.ts","utf8");
 for(const name of ["ag_worker_commit_cycle_decision","ag_worker_commit_watch_operation","ag_worker_verify_decision_manifest","ag_worker_verify_cycle_watch_manifest","ag_worker_complete_persistence_stage","ag_worker_finalize_daily_cycle"])assert.match(source,new RegExp(name));
 assert.doesNotMatch(source,/createClient\(|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
test("durability worker SQL wrappers are service-role-only and bind cycle capability",async()=>{
 const sql=await readFile("supabase/migration-candidates/20261006_ag_autonomous_worker_authorization_review_candidate.sql","utf8");
 const names=["ag_worker_commit_cycle_decision","ag_worker_commit_watch_operation","ag_worker_verify_decision_manifest","ag_worker_verify_cycle_watch_manifest","ag_worker_complete_persistence_stage","ag_worker_finalize_daily_cycle"];
 for(const name of names){
  assert.match(sql,new RegExp("create or replace function public\\."+name));
  assert.match(sql,new RegExp("revoke all on function public\\."+name+"[\\s\\S]*?from public,anon,authenticated"));
  assert.match(sql,new RegExp("grant execute on function public\\."+name+"[\\s\\S]*?to service_role"));
 }
 assert.match(sql,/ag_bind_cycle_worker_identity/);
});
