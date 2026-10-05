import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG finalization contract requires completed persistence and verified manifests",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/cycle-finalization-contract.ts","utf8");
 assert.match(source,/PERSISTENCE_NOT_COMPLETE/);
 assert.match(source,/PERSISTENCE_OUTPUT_MISSING/);
 assert.match(source,/DECISION_MANIFEST_NOT_VERIFIED/);
 assert.match(source,/WATCH_MANIFEST_NOT_VERIFIED/);
 assert.match(source,/COMPLETED_CYCLE_POSTCONDITION_MISMATCH/);
 assert.doesNotMatch(source,/createClient|supabase|executeAgDailyCycleTransactions/);
});

test("research-only coordinator cannot finalize the authoritative cycle",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/resumable-cycle-orchestrator.ts","utf8");
 assert.doesNotMatch(source,/cycle-finalization-contract/);
 assert.doesNotMatch(source,/status:"completed"/);
 assert.doesNotMatch(source,/completed_at/);
});
