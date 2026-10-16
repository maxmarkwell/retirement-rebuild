/** Pure research-cycle rehearsal: no auth, database, model calls, or trades.
 * Tests the handoff from discovered candidates to committee decisions and counters.
 * This is NOT a live pipeline integration test.
 */
import { assertAgDecisionBatchIsUnambiguous } from "./daily-cycle-decision-preflight";
import { validateAgCycleCounts } from "./daily-cycle-counts";

export type AgResearchRehearsal = {
  universeCount: number;
  preselectedCount: number;
  evaluatedCount: number;
  advancedSymbols: string[];
  catalystSymbols: string[];
  completedResearchSymbols: string[];
  failedResearchSymbols: string[];
  proceedSymbols: string[];
  committeeDecisions: Array<{ symbol: string; decision: "BUY" | "WATCH" | "PASS" }>;
  holdingDecisions: Array<{ symbol: string; decision: "HOLD" | "SELL" }>;
};

function unique(symbols: string[], label: string): Set<string> {
  const normalized = symbols.map((symbol) => symbol.trim().toUpperCase());
  if (normalized.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) ||
      new Set(normalized).size !== normalized.length) {
    throw new Error("AG_REHEARSAL_INVALID_SYMBOLS:" + label);
  }
  return new Set(normalized);
}
function subset(items: Set<string>, parent: Set<string>, label: string) {
  if ([...items].some((symbol) => !parent.has(symbol))) {
    throw new Error("AG_REHEARSAL_STAGE_MISMATCH:" + label);
  }
}
export function rehearseAgResearchCycle(input: AgResearchRehearsal) {
  const advanced = unique(input.advancedSymbols, "advanced");
  const catalysts = unique(input.catalystSymbols, "catalyst");
  const completed = unique(input.completedResearchSymbols, "completed");
  const failed = unique(input.failedResearchSymbols, "failed");
  const proceed = unique(input.proceedSymbols, "proceed");
  const committee = unique(input.committeeDecisions.map((item) => item.symbol), "committee");
  const holding = unique(input.holdingDecisions.map((item) => item.symbol), "holding");
  subset(catalysts, advanced, "catalyst");
  subset(completed, catalysts, "completed");
  subset(failed, catalysts, "failed");
  subset(proceed, completed, "proceed");
  subset(committee, proceed, "committee");
  if ([...completed].some((symbol) => failed.has(symbol))) {
    throw new Error("AG_REHEARSAL_RESEARCH_OUTCOME_CONFLICT");
  }
  if (committee.size !== proceed.size) throw new Error("AG_REHEARSAL_COMMITTEE_INCOMPLETE");
  assertAgDecisionBatchIsUnambiguous({
    holdingSymbols: [...holding],
    committeeSymbols: [...committee],
  });
  const counts = {
    universeCount: input.universeCount,
    preselectedCount: input.preselectedCount,
    evaluatedCount: input.evaluatedCount,
    discoveryAdvanceCount: advanced.size,
    catalystSupportedCount: catalysts.size,
    deepResearchCompletedCount: completed.size,
    deepResearchFailedCount: failed.size,
    proceedCount: proceed.size,
    committeeDecisionCount: committee.size + holding.size,
    persistedDecisionCount: committee.size + holding.size,
  };
  validateAgCycleCounts(counts);
  return {
    counts,
    researchComplete: true as const,
    eligibleForPersistence: true as const,
    tradesExecuted: 0 as const,
    // This is a rehearsal; persistedDecisionCount is a proposed expected count,
    // not a claim that any rows were actually written.
  };
}
