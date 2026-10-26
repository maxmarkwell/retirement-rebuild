import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const path = "app/api/accelerated-growth/buy-sizing-preview/route.ts";
const source = readFileSync(path, "utf8");

assert.match(source, /export async function GET\(/);
assert.match(source, /auth\.getUser\(\)/);
assert.match(source, /eq\("user_id", user\.id\)/);
assert.match(source, /eq\("is_real_money", false\)/);
assert.match(source, /eq\("strategy_key", "accelerated_growth"\)/);
assert.match(source, /eq\("execution_mode", "paper"\)/);
assert.match(source, /eq\("portfolio_id", portfolio\.id\)/);
assert.match(source, /decisions\?\.length \?\? 0\) > 1/);
assert.match(source, /previewAgBuySizing\(/);
assert.match(source, /reassessmentComplete: false/);
assert.match(source, /"Cache-Control": "private, no-store"/);
assert.doesNotMatch(source, /executeAgPaperBuy|execute_ag_paper_buy_authorized|advance_ag_high_water_mark|createAdminClient/);
assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
assert.doesNotMatch(source, /runAgCommittee\(|persistAgCommitteeDecisions\(/);
console.log("AG sizing route read-only boundary checks passed");
