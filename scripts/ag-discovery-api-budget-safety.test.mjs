import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG discovery evaluation stays within five FMP calls per candidate",async()=>{
 const evaluate=await readFile("lib/discovery/accelerated-growth/evaluate.ts","utf8");
 const lean=await readFile("lib/discovery/accelerated-growth/scoring-fundamentals.ts","utf8");
 const discovery=await readFile("lib/discovery/accelerated-growth/discovery.ts","utf8");
 assert.match(evaluate,/getAcceleratedGrowthFundamentals/);
 assert.match(evaluate,/getCompanyEarningsContext/);
 assert.match(evaluate,/getAgScoringFundamentals/);
 assert.doesNotMatch(evaluate,/getCompanyFundamentals/);
 assert.match(lean,/"ratios-ttm"/);
 assert.match(lean,/"key-metrics-ttm"/);
 assert.doesNotMatch(lean,/profile|balance-sheet-statement|period:"annual"/);
 assert.doesNotMatch(discovery,/getAgBulkGrowthSignals/);
 assert.match(discovery,/market_quality_fallback/);
});
