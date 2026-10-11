import "server-only";
import {
  persistAgCommitteeDecisions,
  persistAgResearchWatchlist,
  runAgCommitteePipeline,
  supersedeAgCommitteeWatches,
} from "./committee-pipeline";
import { runAgDailyCycle } from "./daily-cycle";
import { persistAgHoldingReviewDecisions, runAgHoldingReviewPipeline } from "./holding-review-pipeline";
import { executeAgDailyCycleTransactions } from "./daily-cycle-execution";
import { assertAgDecisionBatchIsUnambiguous } from "./daily-cycle-decision-preflight";
import { validateAgCycleCounts } from "./daily-cycle-counts";

export async function runAgResearchDailyCycle(options?: {
  maxCandidates?: number;
  retryFailed?: boolean;
  executeTransactions?: boolean;
}) {
  const maxCandidates = options?.maxCandidates ?? 5;
  const executeTransactions = options?.executeTransactions === true;

  return runAgDailyCycle({
    maxCandidates,
    retryFailed: options?.retryFailed ?? false,
    retrySafety: "may_write",
    work: async (context) => {
      const holdingReviews = await runAgHoldingReviewPipeline();
      if (holdingReviews.errors.length > 0 || holdingReviews.failedCount > 0) {
        throw new Error("Holding reassessment did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      const pipeline = await runAgCommitteePipeline({ maxCandidates });
      if (pipeline.errors.length > 0 || pipeline.failedCount > 0) {
        throw new Error("Committee pipeline did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      assertAgDecisionBatchIsUnambiguous({
        holdingSymbols: holdingReviews.decisions.map((decision) => decision.symbol),
        committeeSymbols: pipeline.decisions.map((decision) => decision.symbol),
      });

      // Validate the research results before the first irreversible write.
      validateAgCycleCounts({
        universeCount: pipeline.upstream.discovery.universeCount,
        preselectedCount: pipeline.upstream.discovery.preselectedCount,
        evaluatedCount: pipeline.upstream.discovery.evaluatedCount,
        discoveryAdvanceCount: pipeline.upstream.discovery.advanceCount,
        catalystSupportedCount: pipeline.upstream.catalystSupportedCount,
        deepResearchCompletedCount: pipeline.upstream.deepResearchCompletedCount,
        deepResearchFailedCount: pipeline.upstream.deepResearchFailedCount,
        proceedCount: pipeline.upstream.proceedCount,
        committeeDecisionCount: pipeline.decisions.length + holdingReviews.decisions.length,
        persistedDecisionCount: pipeline.decisions.length + holdingReviews.decisions.length,
      });

      let persistenceStage = "research_watchlist";
      try {
      await persistAgResearchWatchlist(
        context.portfolioId,
        pipeline.upstream.deepResearchOutcomes,
        pipeline.upstream.quantitativeWatchResolutions
      );
      persistenceStage = "committee_watch_supersession";
      const supersededCommitteeWatchCount = await supersedeAgCommitteeWatches(
        context.portfolioId,
        pipeline.upstream.committeeWatchResolutions
      );
      persistenceStage = "holding_decisions";
      const persistedHoldingReviews = await persistAgHoldingReviewDecisions(context.portfolioId, holdingReviews.decisions);
      persistenceStage = "committee_decisions";
      const persisted = await persistAgCommitteeDecisions(context.portfolioId, pipeline.decisions);
      persistenceStage = "paper_execution";
      const execution = await executeAgDailyCycleTransactions({
        enabled: executeTransactions,
        buyDecisions: persisted,
        holdingDecisions: persistedHoldingReviews,
      });

      persistenceStage = "completed";
      return {
        result: {
          persisted: true,
          researchWatchlistPersisted: true,
          supersededCommitteeWatchCount,
          transactionsWritten: execution.executedBuyCount + execution.executedSellCount > 0,
          executionEnabled: execution.enabled,
          execution,
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown persistence error";
        throw new Error(`AG_PERSISTENCE_STAGE_FAILED:${persistenceStage}: ${message}`);
      }
    },
  });
}
