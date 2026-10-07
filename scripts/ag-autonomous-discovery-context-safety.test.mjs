import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("autonomous Discovery uses cycle-scoped worker context instead of browser auth",()=>{
 const work=read("lib/discovery/accelerated-growth/discovery-stage-work.ts");
 const adapter=read("lib/discovery/accelerated-growth/resumable-daily-cycle-adapter.ts");
 const ctx=read("lib/discovery/accelerated-growth/autonomous-worker-context.ts");
 assert.match(work,/workerContext\.readDiscoveryContext/);
 assert.match(adapter,/workerContext:input\.context/);
 assert.match(ctx,/ag_worker_read_discovery_context/);
});
test("autonomous worker persists terminal stage failure before revocation",()=>{
 const step=read("lib/discovery/accelerated-growth/autonomous-worker-step.ts");
 const ctx=read("lib/discovery/accelerated-growth/autonomous-worker-context.ts");
 assert.match(step,/markStageNeedsReview/);
 assert.match(step,/finishAgWorker\(input\.cycleId,input\.token,"revoked"\)/);
 assert.ok(step.indexOf("markStageNeedsReview")<step.lastIndexOf("finishAgWorker"));
 assert.match(ctx,/ag_worker_mark_cycle_stage_needs_review/);
});
test("worker discovery SQL remains cycle-bound and paper-only",()=>{
 const sql=read("supabase/migration-candidates/20261007_ag_worker_discovery_context_failure_candidate.sql");
 assert.match(sql,/ag_bind_cycle_worker_identity/);
 assert.match(sql,/p\.type='paper_active'/);
 assert.match(sql,/p\.is_real_money=false/);
 assert.match(sql,/e\.strategy_key='accelerated_growth'/);
 assert.match(sql,/e\.execution_mode='paper'/);
 assert.match(sql,/grant execute on function public\.ag_worker_read_discovery_context.*service_role/s);
 assert.match(sql,/revoke all on function public\.ag_worker_read_discovery_context.*authenticated/s);
});
