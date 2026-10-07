import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
test("AG discovery sources bounded evaluation from the broad diversified pre-screen",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/discovery.ts","utf8");
 assert.match(source,/preScreenDynamicUniverse\(universe\)/);
 assert.match(source,/broadPreScreenCount: broadPreScreen\.selectedCount/);
 assert.match(source,/selectorSignal: "market_quality_fallback"/);
 assert.match(source,/bulkGrowthCoverageCount: growthSignals\.size/);
 assert.doesNotMatch(source,/getAgBulkGrowthSignals/);
 assert.match(source,/small: 12, mid: 12, large: 8, mega: 4/);
 assert.match(source,/sectorCap = Math\.max\(2, Math\.ceil\(limit \* 0\.34\)\)/);
 assert.doesNotMatch(source,/const BUCKET_LIMITS.*small: 8, mid: 8, large: 4, mega: 2/);
 assert.match(source,/reassessSymbols/);
 assert.match(source,/DISCOVERY_SOFT_BUDGET_MS = 150_000/);
});
