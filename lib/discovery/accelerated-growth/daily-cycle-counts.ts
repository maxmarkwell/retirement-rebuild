/** A completed AG research cycle must have auditable, coherent counters. */
export type AgCycleCounts = {
  universeCount?: number;
  preselectedCount?: number;
  evaluatedCount?: number;
  discoveryAdvanceCount?: number;
  catalystSupportedCount?: number;
  deepResearchCompletedCount?: number;
  deepResearchFailedCount?: number;
  proceedCount?: number;
  committeeDecisionCount?: number;
  persistedDecisionCount?: number;
};

const fields = [
  "universeCount", "preselectedCount", "evaluatedCount", "discoveryAdvanceCount",
  "catalystSupportedCount", "deepResearchCompletedCount", "deepResearchFailedCount",
  "proceedCount", "committeeDecisionCount", "persistedDecisionCount",
] as const;

export function validateAgCycleCounts(counts: AgCycleCounts | undefined): asserts counts is Required<AgCycleCounts> {
  if (!counts) throw new Error("AG_CYCLE_MISSING_COUNTS");
  for (const key of fields) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0)
      throw new Error("AG_CYCLE_INVALID_COUNT:" + key);
  }
  if (counts.preselectedCount! > counts.universeCount! ||
      counts.evaluatedCount! > counts.preselectedCount! ||
      counts.discoveryAdvanceCount! > counts.evaluatedCount! ||
      counts.catalystSupportedCount! > counts.discoveryAdvanceCount! ||
      counts.deepResearchCompletedCount! > counts.catalystSupportedCount! ||
      counts.proceedCount! > counts.deepResearchCompletedCount! ||
      counts.persistedDecisionCount! > counts.committeeDecisionCount!)
    throw new Error("AG_CYCLE_INCONSISTENT_COUNTS");
}
