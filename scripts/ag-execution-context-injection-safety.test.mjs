import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("resumable AG adapter preserves authenticated defaults while allowing scoped IO",async()=>{
 const adapter=await readFile("lib/discovery/accelerated-growth/resumable-daily-cycle-adapter.ts","utf8");
 assert.match(adapter,/context\?:import\("\.\/cycle-execution-context"\)\.AgCycleExecutionContext/);
 assert.match(adapter,/readAuthenticatedAgCheckpointStatus/);
 assert.match(adapter,/createAuthenticatedAgStageCheckpointRpc/);
 assert.match(adapter,/reclaimAuthenticatedAgExpiredSymbolParent/);
 assert.match(adapter,/assertAgExecutionContext/);
 assert.match(adapter,/input\.context\?\.createStageRpc\?\?createAuthenticatedAgStageCheckpointRpc/);
 assert.doesNotMatch(adapter,/createAdminClient|SUPABASE_SERVICE_ROLE_KEY|executeAgDailyCycleTransactions|daily-cycle-execution/);
});

test("symbol fanout defaults remain authenticated",async()=>{
 const fanout=await readFile("lib/discovery/accelerated-growth/resumable-symbol-fanout.ts","utf8");
 assert.match(fanout,/createAuthenticatedAgSymbolCheckpointIo/);
 assert.match(fanout,/readAuthenticatedAgCompletedStageOutput/);
 assert.match(fanout,/input\.io\?\.createSymbolIo\?\?createAuthenticatedAgSymbolCheckpointIo/);
 assert.match(fanout,/input\.io\?\.readCompletedStageOutput\?\?defaultRead/);
 assert.doesNotMatch(fanout,/createAdminClient|SUPABASE_SERVICE_ROLE_KEY|executeAgDailyCycleTransactions|daily-cycle-execution/);
});
