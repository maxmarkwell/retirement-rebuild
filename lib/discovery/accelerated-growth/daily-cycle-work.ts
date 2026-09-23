import "server-only";
import {
  persistAgCommitteeDecisions,
  persistAgResearchWatchlist,
  runAgCommitteePipeline,
} from "./committee-pipeline";
import { runAgDailyCycle } from "./daily-cycle";
import { persistAgHoldingReviewDecisions, runAgHoldingReviewPipeline } from "./holding-review-pipeline";

export async function runAgResearchDailyCycle(options?: {
  maxCandidates?: number;
  retryFailed?: boolean;
}) {
  const maxCandidates = options?.maxCandidates ?? 5;

  return runAgDailyCycle({
    maxCandidates,
    retryFailed: options?.retryFailed ?? false,
    work: async (context) => {
      // Existing holdings are reviewed independently of new-stock Discovery.
      // Any failed holding review fails the whole authoritative cycle so we never
      // silently mark a day complete while an owned position escaped reassessment.
      const holdingReviews = await runAgHoldingReviewPipeline();
      if (holdingReviews.errors.length > 0 || holdingReviews.failedCount > 0) {
        throw new Error("Holding reassessment did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      const pipeline = await runAgCommitteePipeline({ maxCandidates });
      if (pipeline.errors.length > 0 || pipeline.failedCount > 0) {
        throw new Error("Committee pipeline did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      await persistAgResearchWatchlist(context.portfolioId, pipeline.upstream.deepResearchOutcomes);
      const persistedHoldingReviews = await persistAgHoldingReviewDecisions(context.portfolioId, holdingReviews.decisions);
      const persisted = await persistAgCommitteeDecisions(context.portfolioId, pipeline.decisions);

      return {
        result: {
          persisted: true,
          researchWatchlistPersisted: true,
          transactionsWritten: false,
          portfolioId: context.portfolioId,
          cycleId: context.cycleId,
          cycleDate: context.cycleDate,
          holdingReviewCount: holdingReviews.decisions.length,
          persistedHoldingReviewCount: persistedHoldingReviews.length,
          holdingReviews: holdingReviews.decisions,
          persistedHoldingReviews,
          committeeDecisionCount: pipeline.decisions.length,
          persistedCount: persisted.length,
          persistedDecisions: persisted,
          decisions: pipeline.decisions,
          upstream: pipeline.upstream,
        },
        counts: {
          universeCount: pipeline.upstream.discovery.universeCount,
          preselectedCount: pipeline.upstream.discovery.preselectedCount,
          evaluatedCount: pipeline.upstream.discovery.evaluatedCount,
          discoveryAdvanceCount: pipeline.upstream.discovery.advanceCount,
          catalystSupportedCount: pipeline.upstream.catalystSupportedCount,
          deepResearchCompletedCount: pipeline.upstream.deepResearchCompletedCount,
          deepResearchFailedCount: pipeline.upstream.deepResearchFailedCount,
          proceedCount: pipeline.upstream.proceedCount,
          committeeDecisionCount: pipeline.decisions.length + holdingReviews.decisions.length,
          persistedDecisionCount: persisted.length + persistedHoldingReviews.length,
        },
      };
    },
  });
}
