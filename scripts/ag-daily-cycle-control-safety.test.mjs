import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG daily control presents autonomous lifecycle instead of repeated-click semantics",async()=>{
 const source=await readFile("components/ag-daily-cycle-control.tsx","utf8");
 assert.match(source,/Start Daily Research/);
 assert.match(source,/Research Running/);
 assert.match(source,/Research Complete/);
 assert.match(source,/Research is running automatically/);
 assert.match(source,/displayedCycleDate/);
 assert.match(source,/activePriorDateCycle/);
 assert.match(source,/Deep Research/);
 assert.match(source,/completedStages/);
 assert.match(source,/disabled=\{running \|\| status\.status === "running"/);
 assert.doesNotMatch(source,/Run Today's AG Research|Today's Accelerated Growth research cycle completed/);
});
