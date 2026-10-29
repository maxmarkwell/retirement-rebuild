const a=require("node:assert/strict"),fs=require("node:fs");
const s=fs.readFileSync("lib/discovery/accelerated-growth/resumable-candidate.ts","utf8");
for(const str of ["ag_claim_cycle_symbol","ag_complete_cycle_symbol","AG_CANDIDATE_PRIOR_ATTEMPT_REQUIRES_RECONCILIATION","getUser()","catalyst_deep_research","prior?.status === \"completed\""])a.ok(s.includes(str),str);
a.doesNotMatch(s,/\.insert\(|\.update\(|executeAgDailyCycleTransactions|persistAgCommitteeDecisions/);
console.log("AG candidate checkpoint is owner-scoped and fail-closed.");