import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG status prefers an authoritative running prior-date cycle over today's empty slot",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/daily-cycle-status.ts","utf8");
 assert.match(source,/activeCycle = runningCycles\[0\]/);
 assert.match(source,/authoritativeCycle = activeCycle \?\? cycle \?\? null/);
 assert.match(source,/displayedCycleDate: authoritativeCycle\?\.cycle_date \?\? cycleDate/);
 assert.match(source,/activePriorDateCycle: Boolean\(activeCycle && activeCycle\.cycle_date !== cycleDate\)/);
 assert.match(source,/cycle: authoritativeCycle/);
 assert.match(source,/rpc\("ag_read_cycle_checkpoint_status"/);
 assert.doesNotMatch(source,/\.from\("ag_cycle_stage_checkpoints"\)/);
 assert.match(source,/deepResearchCompleted/);
 assert.match(source,/deepResearchTotal/);
});
