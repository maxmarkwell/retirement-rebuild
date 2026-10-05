import test from "node:test";import assert from "node:assert/strict";
import {planAgResume} from "./resume-planner";
const base=(stage:string,status:string,leaseExpiresAt:string|null=null):any=>({
 checkpointId:"11111111-1111-4111-8111-111111111111",stage,status,attemptCount:1,
 startedAt:null,completedAt:status==="completed"?"2026-10-05T15:00:00Z":null,leaseExpiresAt,updatedAt:"2026-10-05T15:00:00Z"});
const done=(...stages:string[])=>stages.map(s=>base(s,"completed"));
test("runs first missing stage after completed prefix",()=>assert.deepEqual(
 planAgResume(done("holding_review","discovery"),Date.parse("2026-10-05T16:00:00Z")),
 {action:"run",stage:"catalyst_deep_research"}));
test("waits for live lease and never steals it",()=>assert.deepEqual(
 planAgResume([...done("holding_review"),base("discovery","running","2026-10-05T16:05:00Z")],Date.parse("2026-10-05T16:00:00Z")),
 {action:"wait",stage:"discovery",reason:"active_lease"}));
test("stale running and failed checkpoints require review",()=>{
 for(const row of [base("holding_review","running","2026-10-05T15:59:00Z"),base("holding_review","failed")])
  assert.equal(planAgResume([row],Date.parse("2026-10-05T16:00:00Z")).action,"manual_review");
});
test("explicit review is never auto-reclaimed",()=>assert.deepEqual(planAgResume([base("holding_review","needs_manual_review")]),
 {action:"manual_review",stage:"holding_review",reason:"explicit_review"}));
test("duplicate stage evidence fails closed",()=>assert.throws(()=>planAgResume([base("holding_review","completed"),base("holding_review","completed")])));
