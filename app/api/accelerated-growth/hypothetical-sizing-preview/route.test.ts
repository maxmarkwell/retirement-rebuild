import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
const source = readFileSync("app/api/accelerated-growth/hypothetical-sizing-preview/route.ts", "utf8");
for (const pattern of [/auth\.getUser\(\)/, /eq\("user_id", user\.id\)/, /eq\("is_real_money", false\)/, /symbol !== "VRT"/, /calculateAgEraAccounting\(/, /valueAgSleeve\(/, /calculateAgThemeMarketValue\(/, /evaluateAgPortfolioGuardrails\(/, /sizeAgBuy\(/, /hypothetical: true/, /executionEligible: false/, /reassessmentComplete: false/]) assert.match(source, pattern);
for (const pattern of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/, /executeAgPaperBuy/, /createAdminClient/, /persistAgCommitteeDecisions/, /runAgCommittee\(/]) assert.doesNotMatch(source, pattern);
console.log("Hypothetical AG diagnostic static write-boundary checks passed");
