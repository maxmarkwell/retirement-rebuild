import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
const page = readFileSync("app/page.tsx", "utf8");
assert.match(page, /realUnpricedTickers/);
assert.match(page, /Awaiting quote:/);
assert.match(page, /Estimated investment account value/);
assert.match(page, /Uses purchase cost for/);
assert.match(page, /realQuotesComplete: !realMissingQuotes/);
console.log("Dashboard missing-quote explanation guard passed");
