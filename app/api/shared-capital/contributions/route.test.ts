import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
const code = readFileSync("app/api/shared-capital/contributions/route.ts", "utf8");
for (const pattern of [
  /SHARED_CONTRIBUTION_POSTING_ENABLED/,
  /auth\.getUser\(\)/,
  /confirmedExternalDeposit/,
  /request\.headers\.get\("origin"\)/,
  /origin !== expectedOrigin/,
  /application\/json/,
  /planSharedContribution/,
  /\.eq\("user_id", user\.id\)/,
  /\.eq\("type", "real"\)/,
  /\.eq\("is_real_money", true\)/,
  /idempotency_key/,
  /insertError\.code === "23505"/,
  /Request key already belongs to a different contribution/,
  /fundsTransferred: false/,
]) assert.match(code, pattern);
for (const forbidden of [/createAdminClient/, /executeAgPaperBuy/, /\.rpc\(/, /\.update\(/, /\.delete\(/]) assert.doesNotMatch(code, forbidden);
assert.ok(code.indexOf('SHARED_CONTRIBUTION_POSTING_ENABLED') < code.indexOf('supabase.from("contributions")'));
console.log("Gated contribution posting static safeguards passed");
