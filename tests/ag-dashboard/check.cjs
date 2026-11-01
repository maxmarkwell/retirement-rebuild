const assert = require("node:assert/strict");
const fs = require("node:fs");
const page = fs.readFileSync("app/accelerated-growth/page.tsx","utf8");
for (const marker of ["AG working dashboard","Research-to-decision progress","Real-money AG readiness","Not verified by this website","Not certified for live AG","Paper AG Sleeve","Latest recorded daily-cycle counts"]) {
  assert.ok(page.includes(marker), marker);
}
assert.match(page,/cycleStatus\.cycle\?\.deep_research_completed_count/);
assert.match(page,/state\.activeDecisions\.length/);
assert.match(page,/state\.accounting\.sleeveCash/);
assert.match(page,/Live AG trading not enabled/);
assert.doesNotMatch(page,/executeAgTrade\(|authorizeAgExecution\(/);
console.log("AG website shows grounded paper metrics and blocks misleading live-money implications.");
