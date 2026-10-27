import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
// Contract-level checks only. These DO NOT impersonate Supabase auth or prove
// actual concurrent HTTP behavior; those require isolated integration infra.
const route = readFileSync("app/api/shared-capital/contributions/route.ts", "utf8");
const expectations: Array<[string,RegExp]> = [
 ["disabled-by-default flag", /SHARED_CONTRIBUTION_POSTING_ENABLED !== "true"/],
 ["same-origin request requirement", /origin !== expectedOrigin/],
 ["JSON-only", /application\/json/],
 ["authenticated identity", /auth\.getUser\(\)/],
 ["user-scoped portfolio", /\.eq\("user_id", user\.id\)/],
 ["real account only", /\.eq\("type", "real"\)/],
 ["confirmed external deposit", /payload\.confirmedExternalDeposit !== true/],
 ["pure contribution validation", /planSharedContribution\(/],
 ["user-key lookup", /\.eq\("idempotency_key", plan\.idempotencyKey\)/],
 ["key collision handling", /insertError\.code === "23505"/],
 ["conflicting amount/date rejection", /Request key already belongs to a different contribution/],
 ["no funds transfers", /fundsTransferred: false/],
];
for(const [label,regex] of expectations) assert.match(route,regex,label);
for(const regex of [/createAdminClient/, /executeAgPaperBuy/, /\.rpc\(/]) assert.doesNotMatch(route,regex);
const off = route.indexOf('SHARED_CONTRIBUTION_POSTING_ENABLED !== "true"');
const insert = route.indexOf('.insert({');
assert.ok(off >= 0 && insert > off, "Feature flag must precede the insert");
console.log("Contribution HTTP route contract assertions passed (not end-to-end)");
