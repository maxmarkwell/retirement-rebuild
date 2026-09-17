import { runAgDeepResearchPipeline } from "./deep-research-pipeline";
import { runAgCommittee, type AgCommitteeDecision } from "./committee";

export type AgCommitteePipelineResult = {
  upstream: {
    discovery: Awaited<ReturnType<typeof runAgDeepResearchPipeline>>["discovery"];
    catalystSupportedCount: number;
    deepResearchCompletedCount: number;
    deepResearchFailedCount: number;
    proceedCount: number;
  };
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  decisions: AgCommitteeDecision[];
  errors: Array<{ symbol: string; stage: "UPSTREAM" | "COMMITTEE"; error: string }>;
};

export async function runAgCommitteePipeline(options?: { maxCandidates?: number }): Promise<AgCommitteePipelineResult> {
  const upstream = await runAgDeepResearchPipeline({ maxCandidates: options?.maxCandidates ?? 5 });
  const proceed = upstream.results.filter((result) => result.researchStatus === "PROCEED");

  const upstreamSummary = {
    discovery: upstream.discovery,
    catalystSupportedCount: upstream.catalystSupportedCount,
    deepResearchCompletedCount: upstream.completedCount,
    deepResearchFailedCount: upstream.failedCount,
    proceedCount: proceed.length,
  };

  if (upstream.errors.length > 0 || upstream.discovery.rateLimited || upstream.discovery.stoppedEarly) {
    return {
      upstream: upstreamSummary,
      requestedCount: 0,
      completedCount: 0,
      failedCount: 0,
      decisions: [],
      errors: [{ symbol: "UPSTREAM", stage: "UPSTREAM", error: "AG Committee skipped because upstream research did not complete cleanly." }],
    };
  }

  const decisions: AgCommitteeDecision[] = [];
  const errors: AgCommitteePipelineResult["errors"] = [];

  // Committee is intentionally sequential and only receives Deep Research PROCEED candidates.
  for (const research of proceed) {
    try {
      decisions.push(await runAgCommittee(research));
    } catch (error) {
      errors.push({ symbol: research.symbol, stage: "COMMITTEE", error: error instanceof Error ? error.message : "Unknown AG Committee error." });
    }
  }

  return {
    upstream: upstreamSummary,
    requestedCount: proceed.length,
    completedCount: decisions.length,
    failedCount: errors.length,
    decisions,
    errors,
  };
}
