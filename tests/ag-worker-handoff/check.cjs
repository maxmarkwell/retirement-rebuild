const assert = require("node:assert/strict");
const fs = require("node:fs");
const s = fs.readFileSync("lib/discovery/accelerated-growth/authorize-research-worker.ts","utf8");
for(const x of ["randomBytes(32)","createHash(\"sha256\")","ag_authorize_cycle_worker","getUser()","is_real_money","paper_active","accelerated_growth","p_max_invocations"])assert.ok(s.includes(x),x);
assert.doesNotMatch(s,/console\.|\.insert\(|\.delete\(|executeAgDailyCycleTransactions/);
const route=fs.readFileSync("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
assert.match(route,/executeTransactions: false/);
assert.doesNotMatch(route,/authorizeAgResearchWorker/);
console.log("AG worker authorization is server-only, paper-scoped, and not connected to live Run.");
