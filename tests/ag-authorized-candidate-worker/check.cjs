const assert = require("node:assert/strict");
const fs = require("node:fs");
const source = fs.readFileSync("lib/discovery/accelerated-growth/authorized-candidate-worker.ts", "utf8");
for (const required of [
  '"server-only"', "ag_worker_read_completed_stage_output",
  "ag_worker_read_cycle_symbol_checkpoints", "ag_worker_claim_cycle_symbol",
  "ag_worker_complete_cycle_symbol", "AG_WORKER_CANDIDATE_REQUIRES_MANUAL_REVIEW",
  "researchAgCatalyst", "researchAgDeepCandidate",
]) assert.ok(source.includes(required), required);
assert.doesNotMatch(source, /createClient\(|executeAgDailyCycleTransactions|persistAgCommitteeDecisions|\.from\("investment_decisions"\)/);
const route = fs.readFileSync("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
assert.match(route, /executeTransactions: false/);
console.log("Detached AG candidate worker guards verified; Run button remains unchanged.");
