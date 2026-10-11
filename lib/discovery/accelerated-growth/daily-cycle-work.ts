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
import { createClient } from "@/lib/supabase/server";

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

      if (holdingReviews.portfolioId !== context.portfolioId || holdingReviews.eraId !== context.strategyEraId) {
        throw new Error("AG_CYCLE_HOLDING_CONTEXT_MISMATCH");
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

      const supabase = await createClient();
      const markStage = async (stage: string) => {
        const { error } = await supabase.from("ag_daily_cycles").update({
          failure_message: `AG_PERSISTENCE_IN_PROGRESS:${stage}`,
          updated_at: new Date().toISOString(),
        }).eq("id", context.cycleId).eq("portfolio_id", context.portfolioId)
          .eq("strategy_era_id", context.strategyEraId).eq("status", "running");
        if (error) throw new Error(`AG_STAGE_CHECKPOINT_FAILED:${stage}: ${error.message}`);
      };

      let persistenceStage = "research_watchlist";
      try {
      await markStage(persistenceStage);
      await persistAgResearchWatchlist(
        context.portfolioId,
        pipeline.upstream.deepResearchOutcomes,
        pipeline.upstream.quantitativeWatchResolutions
      );
      persistenceStage = "committee_watch_supersession";
      await markStage(persistenceStage);
      const supersededCommitteeWatchCount = await supersedeAgCommitteeWatches(
        context.portfolioId,
        pipeline.upstream.committeeWatchResolutions
      );
      persistenceStage = "holding_decisions";
      await markStage(persistenceStage);
      const persistedHoldingReviews = await persistAgHoldingReviewDecisions(context.portfolioId, holdingReviews.decisions);
      persistenceStage = "committee_decisions";
      await markStage(persistenceStage);
      const persisted = await persistAgCommitteeDecisions(context.portfolioId, pipeline.decisions);
      persistenceStage = "paper_execution";
      await markStage(persistenceStage);
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
