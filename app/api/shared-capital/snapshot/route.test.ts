import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
const source = readFileSync("app/api/shared-capital/snapshot/route.ts", "utf8");
for (const re of [/export async function GET\(/, /auth\.getUser\(\)/, /eq\("user_id", user\.id\)/, /eq\("is_real_money", true\)/, /eq\("type", "real"\)/, /previewSharedCapital\(/, /"Cache-Control": "private, no-store"/, /transactionsWritten: false/, /contributionsWritten: false/]) assert.match(source, re);
for (const re of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /createAdminClient/, /executeAgPaperBuy/]) assert.doesNotMatch(source, re);
console.log("Shared capital snapshot static safety boundary passed");
