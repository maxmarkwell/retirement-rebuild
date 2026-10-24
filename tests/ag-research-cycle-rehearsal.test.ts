import assert from "node:assert/strict";
import { test } from "node:test";
import { rehearseAgResearchCycle } from "../lib/discovery/accelerated-growth/research-cycle-rehearsal";

const baseline = () => ({
  universeCount: 100,
  preselectedCount: 4,
  evaluatedCount: 4,
  advancedSymbols: ["ACME","BETA"],
  catalystSymbols: ["ACME"],
  completedResearchSymbols: ["ACME"],
  failedResearchSymbols: [],
  proceedSymbols: ["ACME"],
  committeeDecisions: [{ symbol: "ACME", decision: "BUY" as const }],
  holdingDecisions: [{ symbol: "HELD", decision: "HOLD" as const }],
});
test("complete synthetic research handoff is coherent and executes no trades", () => {
  const result = rehearseAgResearchCycle(baseline());
  assert.equal(result.researchComplete, true);
  assert.equal(result.tradesExecuted, 0);
  assert.equal(result.counts.committeeDecisionCount, 2);
});
test("rejects committee omission and upstream symbol mismatches", () => {
  assert.throws(() => rehearseAgResearchCycle({...baseline(), committeeDecisions: []}), /AG_REHEARSAL_COMMITTEE_INCOMPLETE/);
  assert.throws(() => rehearseAgResearchCycle({...baseline(), catalystSymbols: ["WRONG"]}), /AG_REHEARSAL_STAGE_MISMATCH/);
});
test("rejects ambiguous committee/holding symbols and conflicting research results", () => {
  assert.throws(() => rehearseAgResearchCycle({...baseline(), holdingDecisions: [{symbol:"ACME",decision:"HOLD"}]}));
  assert.throws(() => rehearseAgResearchCycle({...baseline(), failedResearchSymbols: ["ACME"]}), /AG_REHEARSAL_RESEARCH_OUTCOME_CONFLICT/);
});
test("valid empty committee is allowed when research has no proceed candidates", () => {
  const result = rehearseAgResearchCycle({...baseline(), proceedSymbols: [], committeeDecisions: []});
  assert.equal(result.counts.committeeDecisionCount, 1);
});
