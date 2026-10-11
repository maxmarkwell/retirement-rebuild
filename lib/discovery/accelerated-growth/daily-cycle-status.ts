import "server-only";
import { createClient } from "@/lib/supabase/server";
import { denverAgCycleDate } from "./daily-cycle";

export async function getAgDailyCycleStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").eq("is_real_money", false).single();
  if (portfolioError || !portfolio) throw new Error("paper_active portfolio not found.");

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth strategy era is required.");

  const cycleDate = denverAgCycleDate();
  const { data: cycle, error } = await supabase.from("ag_daily_cycles")
    .select("id, cycle_date, status, started_at, completed_at, failure_message, universe_count, preselected_count, evaluated_count, discovery_advance_count, catalyst_supported_count, deep_research_completed_count, deep_research_failed_count, proceed_count, committee_decision_count, persisted_decision_count")
    .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).eq("cycle_date", cycleDate)
    .maybeSingle();
  if (error) throw new Error(`Unable to load AG daily cycle status: ${error.message}`);

  const stageMarker = cycle?.failure_message?.match(/^AG_PERSISTENCE_IN_PROGRESS:([a-z_]+)$/)?.[1] ?? null;
  const failedStage = cycle?.failure_message?.match(/^AG_PERSISTENCE_STAGE_FAILED:([a-z_]+):/)?.[1] ?? null;
  const persistenceStage = stageMarker ?? failedStage;
  const persistenceStarted = Boolean(persistenceStage);
  const { count: activeDecisionCount, error: decisionError } = cycle
    ? await supabase.from("investment_decisions").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("source", "ai_committee")
        .eq("status", "active").gte("created_at", cycle.started_at)
    : { count: null, error: null };
  if (decisionError) throw new Error(`Unable to inspect AG cycle decision records: ${decisionError.message}`);

  return {
    cycleDate,
    hasCycleToday: Boolean(cycle),
    status: cycle?.status ?? "not_run",
    retryAvailable: false,
    reconciliation: {
      persistenceStage,
      persistenceStarted,
      activeDecisionsCreatedSinceCycleStart: activeDecisionCount,
      decisionCountIsCycleAttribution: false,
      recoveryState: cycle?.status === "failed"
        ? "manual_review_required"
        : cycle?.status === "running" && persistenceStarted
          ? "persistence_in_progress_or_interrupted"
          : "not_applicable",
      automaticRetryPermitted: false,
    },
    retryBlockedReason: cycle?.status === "failed"
      ? "AG cycle retries require reconciliation because prior persistence may be partial."
      : null,
    executionEnabled: false,
    transactionsWrittenByCycle: false,
    cycle: cycle ?? null,
  };
}
