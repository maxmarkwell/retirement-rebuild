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
    work: async (context) => {
      const cycleStartedMs = Date.now();
      let phaseStartedMs = cycleStartedMs;
      const phaseFinished = (phase: string) => {
        const now = Date.now();
        console.info("[AG cycle] phase timing", {
          cycleId: context.cycleId,
          phase,
          phaseElapsedMs: now - phaseStartedMs,
          cycleElapsedMs: now - cycleStartedMs,
        });
        phaseStartedMs = now;
      };
      console.info("[AG cycle] holding review started", { cycleId: context.cycleId });
      const holdingReviews = await runAgHoldingReviewPipeline();
      phaseFinished("holding_review");
      console.info("[AG cycle] holding review finished", { cycleId: context.cycleId, count: holdingReviews.decisions.length, errors: holdingReviews.errors.length });
      if (holdingReviews.errors.length > 0 || holdingReviews.failedCount > 0) {
        throw new Error("Holding reassessment did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      console.info("[AG cycle] research pipeline started", { cycleId: context.cycleId, maxCandidates });
      const pipeline = await runAgCommitteePipeline({ maxCandidates });
      phaseFinished("research_and_committee");
      console.info("[AG cycle] research pipeline finished", { cycleId: context.cycleId, evaluated: pipeline.upstream.discovery.evaluatedCount, advanced: pipeline.upstream.discovery.advanceCount, deepResearchCompleted: pipeline.upstream.deepResearchCompletedCount, committeeDecisions: pipeline.decisions.length, errors: pipeline.errors.length });
      if (pipeline.errors.length > 0 || pipeline.failedCount > 0) {
        throw new Error("Committee pipeline did not complete cleanly; no daily-cycle decisions were persisted.");
      }

      console.info("[AG cycle] persistence started", { cycleId: context.cycleId });
      await persistAgResearchWatchlist(
        context.portfolioId,
        pipeline.upstream.deepResearchOutcomes,
        pipeline.upstream.quantitativeWatchResolutions
      );
      phaseFinished("persist_research_watchlist");
      const supersededCommitteeWatchCount = await supersedeAgCommitteeWatches(
        context.portfolioId,
        pipeline.upstream.committeeWatchResolutions
      );
      phaseFinished("supersede_committee_watches");
      const persistedHoldingReviews = await persistAgHoldingReviewDecisions(context.portfolioId, holdingReviews.decisions);
      phaseFinished("persist_holding_reviews");
      const persisted = await persistAgCommitteeDecisions(context.portfolioId, pipeline.decisions);
      phaseFinished("persist_committee_decisions");
      console.info("[AG cycle] decisions persisted", { cycleId: context.cycleId, persisted: persisted.length, holdingReviews: persistedHoldingReviews.length });
      const execution = await executeAgDailyCycleTransactions({
        enabled: executeTransactions,
        buyDecisions: persisted,
        holdingDecisions: persistedHoldingReviews,
      });

      phaseFinished("transaction_execution_gate");
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
    },
  });
}
