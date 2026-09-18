import { runAcceleratedGrowthDiscovery } from "./discovery";
import { researchAgCatalyst, type AgCatalystResearch } from "./catalyst-research";

export type AgCatalystPipelineResult = {
  discovery: {
    universeCount: number;
    preselectedCount: number;
    evaluatedCount: number;
    advanceCount: number;
    rateLimited: boolean;
    stoppedEarly: boolean;
  };
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  results: AgCatalystResearch[];
  errors: Array<{ symbol: string; error: string }>;
};

export async function runAgCatalystPipeline(options?: { maxCandidates?: number }): Promise<AgCatalystPipelineResult> {
  const discovery = await runAcceleratedGrowthDiscovery();

  // Never spend AI/web-search budget on a partial quantitative discovery run.
  if (discovery.rateLimited || discovery.stoppedEarly) {
    return {
      discovery: {
        universeCount: discovery.universeCount,
        preselectedCount: discovery.preselectedCount,
        evaluatedCount: discovery.evaluatedCount,
        advanceCount: discovery.advanceCount,
        rateLimited: discovery.rateLimited,
        stoppedEarly: discovery.stoppedEarly,
      },
      requestedCount: 0,
      completedCount: 0,
      failedCount: 0,
      results: [],
      errors: [{ symbol: "DISCOVERY", error: "Catalyst research skipped because AG Discovery did not complete cleanly." }],
    };
  }

  const maxCandidates = Math.max(1, Math.min(options?.maxCandidates ?? 5, 8));
  const advance = discovery.candidates
    .filter((candidate) => candidate.score.status === "ADVANCE")
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, maxCandidates);

  const results: AgCatalystResearch[] = [];
  const errors: Array<{ symbol: string; error: string }> = [];

  // Sequential by design: catalyst research is deliberately scarce and auditable.
  for (const candidate of advance) {
    try {
      results.push(await researchAgCatalyst(candidate));
    } catch (error) {
      errors.push({
        symbol: candidate.symbol,
        error: error instanceof Error ? error.message : "Unknown catalyst research error.",
      });
    }
  }

  return {
    discovery: {
      universeCount: discovery.universeCount,
      preselectedCount: discovery.preselectedCount,
      evaluatedCount: discovery.evaluatedCount,
      advanceCount: discovery.advanceCount,
      rateLimited: discovery.rateLimited,
      stoppedEarly: discovery.stoppedEarly,
    },
    requestedCount: advance.length,
    completedCount: results.length,
    failedCount: errors.length,
    results,
    errors,
  };
}
