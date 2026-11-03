const assert = require("node:assert/strict");
const fs = require("node:fs");

const route = fs.readFileSync("app/api/accelerated-growth/production-diagnostic/route.ts", "utf8");

assert.match(route, /export async function POST\(/);
assert.match(route, /db\.auth\.getUser\(\)/);
assert.match(route, /\.eq\("user_id", user\.id\)/);
assert.match(route, /"Cache-Control": "no-store"/);
assert.match(route, /AbortSignal\.timeout\(12000\)/);
assert.match(route, /maxRetries: 0/);
assert.match(route, /response\.status === "completed"/);
assert.match(route, /executionEnabled: false/);
assert.match(route, /transactionsWritten: false/);
assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
assert.doesNotMatch(route, /executeTransactions|runAgResearchDailyCycle|processAgOpportunity|service_role/i);
assert.doesNotMatch(route, /response\.text\(\)|error\.message|console\.log\(/);
console.log("AG production diagnostic static isolation checks passed.");
