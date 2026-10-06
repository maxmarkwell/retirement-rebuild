import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG execution context is explicitly cycle and user scoped",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/cycle-execution-context.ts","utf8");
 assert.match(source,/cycleId:string/);
 assert.match(source,/userId:string/);
 assert.match(source,/readCheckpointStatus/);
 assert.match(source,/createStageRpc/);
 assert.match(source,/reclaimExpiredSymbolParent/);
 assert.match(source,/createSymbolIo/);
 assert.match(source,/readCompletedStageOutput/);
 assert.match(source,/ctx\.cycleId!==cycleId/);
 assert.doesNotMatch(source,/createAdminClient|SUPABASE_SERVICE_ROLE_KEY|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
