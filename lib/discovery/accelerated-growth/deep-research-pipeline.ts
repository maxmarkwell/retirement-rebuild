import { runAcceleratedGrowthDiscovery } from "./discovery";
import { researchAgCatalyst } from "./catalyst-research";
import { researchAgDeepCandidate, type AgDeepResearch } from "./deep-research";

export type AgDeepResearchPipelineResult = {
  discovery: {
    universeCount: number;
    preselectedCount: number;
    evaluatedCount: number;
    advanceCount: number;
    rateLimited: boolean;
    stoppedEarly: boolean;
  };
  catalystSupportedCount: number;
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  results: AgDeepResearch[];
  errors: Array<{ symbol: string; stage: "CATALYST" | "DEEP_RESEARCH" | "DISCOVERY"; error: string }>;
};

export async function runAgDeepResearchPipeline(options?: { maxCandidates?: number }): Promise<AgDeepResearchPipelineResult> {
  const discovery = await runAcceleratedGrowthDiscovery();
  const discoverySummary = {
    universeCount: discovery.universeCount,
    preselectedCount: discovery.preselectedCount,
    evaluatedCount: discovery.evaluatedCount,
    advanceCount: discovery.advanceCount,
    rateLimited: discovery.rateLimited,
    stoppedEarly: discovery.stoppedEarly,
  };

  if (discovery.rateLimited || discovery.stoppedEarly) {
    return {
      discovery: discoverySummary,
      catalystSupportedCount: 0,
      requestedCount: 0,
      completedCount: 0,
      failedCount: 0,
      results: [],
      errors: [{ symbol: "DISCOVERY", stage: "DISCOVERY", error: "Deep research skipped because AG Discovery did not complete cleanly." }],
    };
  }

  const maxCandidates = Math.max(1, Math.min(options?.maxCandidates ?? 5, 5));
  const advance = discovery.candidates
    .filter((candidate) => candidate.score.status === "ADVANCE")
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, maxCandidates);

  const results: AgDeepResearch[] = [];
  const errors: AgDeepResearchPipelineResult["errors"] = [];
  let catalystSupportedCount = 0;

  // Intentionally sequential. This is a scarce, high-cost challenge stage.
  for (const candidate of advance) {
    try {
      const catalyst = await researchAgCatalyst(candidate);
      if (catalyst.catalystStatus === "NOT_FOUND") continue;
      catalystSupportedCount += 1;

      try {
        results.push(await researchAgDeepCandidate(candidate, catalyst));
      } catch (error) {
        errors.push({
          symbol: candidate.symbol,
          stage: "DEEP_RESEARCH",
          error: error instanceof Error ? error.message : "Unknown AG deep research error.",
        });
      }
    } catch (error) {
      errors.push({
        symbol: candidate.symbol,
        stage: "CATALYST",
        error: error instanceof Error ? error.message : "Unknown AG catalyst research error.",
      });
    }
  }

  return {
    discovery: discoverySummary,
    catalystSupportedCount,
    requestedCount: advance.length,
    completedCount: results.length,
    failedCount: errors.length,
    results,
    errors,
  };
}
