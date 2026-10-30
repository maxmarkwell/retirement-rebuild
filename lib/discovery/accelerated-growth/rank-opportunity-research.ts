import type { AgOpportunityQualification } from "./opportunity-qualification";

/** Rank saved Discovery evidence, not predicted BUYs, with no path quotas. */
export function rankAgOpportunityResearch(
  results: readonly { symbol: string; qualification: AgOpportunityQualification }[],
) {
  const seen = new Set<string>();
  for (const entry of results) {
    if (seen.has(entry.symbol) || entry.symbol !== entry.qualification.symbol ||
        entry.qualification.version !== "ag-opportunity-v2") {
      throw new Error("AG_V2_RANKING_INVALID_SAVED_RESULT");
    }
    seen.add(entry.symbol);
  }
  return results.filter(r => r.qualification.status === "QUALIFIED" &&
      r.qualification.qualifiedPaths.length > 0 &&
      r.qualification.rankingScore !== null &&
      Number.isFinite(r.qualification.rankingScore))
    .map(r => ({
      symbol: r.symbol,
      opportunityPath: r.qualification.strongestPath,
      qualifiedPaths: r.qualification.qualifiedPaths,
      researchPriority: r.qualification.rankingScore!,
    }))
    .sort((a, b) => b.researchPriority - a.researchPriority || a.symbol.localeCompare(b.symbol));
}
