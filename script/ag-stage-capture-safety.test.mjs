import fs from "node:fs";
import assert from "node:assert/strict";
const root="lib/discovery/accelerated-growth/";
const transport=fs.readFileSync(root+"stage-checkpoint-supabase.ts","utf8");
const capture=fs.readFileSync(root+"stage-checkpoint-capture.ts","utf8");
const builders=fs.readFileSync(root+"stage-payload-builders.ts","utf8");
const runner=fs.readFileSync(root+"daily-cycle-work.ts","utf8");
for(const [name,text] of [["transport",transport],["capture",capture],["builders",builders]]){
 assert.ok(!text.includes("ag_commit_cycle_decision"),name+" must not persist decisions");
 assert.ok(!text.includes("ag_commit_watch_operation"),name+" must not persist watchlist");
 assert.ok(!text.includes("executeAgDailyCycleTransactions"),name+" must not execute transactions");
 assert.ok(!text.includes("daily-cycle-work"),name+" must not import active runner");
}
assert.ok(transport.includes('supabase.rpc("ag_claim_cycle_stage"'));
assert.ok(transport.includes('supabase.rpc("ag_complete_cycle_stage"'));
assert.ok(transport.includes("supabase.auth.getUser()"));
assert.ok(!transport.includes('.from("ag_cycle_stage_checkpoints")'));
assert.ok(!runner.includes("stage-checkpoint-supabase"));
assert.ok(!runner.includes("stage-checkpoint-capture"));
assert.ok(runner.includes("assertAgLegacyPersistenceDisabled();"));
console.log("AG stage-capture isolation contract passed");
