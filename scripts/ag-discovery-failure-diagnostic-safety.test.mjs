import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const handoff=fs.readFileSync(new URL("../lib/discovery/accelerated-growth/research-stage-handoff.ts",import.meta.url),"utf8");
const discovery=fs.readFileSync(new URL("../lib/discovery/accelerated-growth/discovery.ts",import.meta.url),"utf8");
test("incomplete AG Discovery remains rejected with bounded diagnostics",()=>{
 assert.match(handoff,/Incomplete AG Discovery cannot be checkpointed/);
 assert.match(handoff,/rateLimited=/);
 assert.match(handoff,/stoppedEarly=/);
 assert.match(handoff,/slice\(0,3\)/);
 assert.match(handoff,/slice\(0,120\)/);
 assert.match(handoff,/slice\(0,300\)/);
});
test("AG discovery documents the actual broad pre-screen maximum",()=>{
 assert.match(discovery,/up to 300 names/);
 assert.doesNotMatch(discovery,/up to 400 names/);
});
