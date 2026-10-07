import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG bulk growth selector is bounded, cached, and degrades by quarter",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/bulk-growth-selector.ts","utf8");
 assert.match(source,/income-statement-growth-bulk/);
 assert.match(source,/revalidate: 21600/);
 assert.match(source,/\[year - 1, year\]/);
 assert.match(source,/Promise\.allSettled/);
 assert.match(source,/periods\.length === 0/);
 assert.match(source,/growthRevenue/);
 assert.match(source,/growthOperatingIncome/);
 assert.match(source,/growthNetIncome/);
 assert.match(source,/value\.trim\(\) === ""/);
});
