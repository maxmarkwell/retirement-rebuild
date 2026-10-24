import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, cycle_date, attempt_number, status, started_at, updated_at, completed_at, failure_message, universe_count, preselected_count, evaluated_count, discovery_advance_count, catalyst_supported_count, deep_research_completed_count, deep_research_failed_count, proceed_count, committee_decision_count, persisted_decision_count")
    .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).eq("cycle_date", cycleDate)
    .order("attempt_number", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Unable to load AG daily cycle status: ${error.message}`);

  const { data: unfinishedCycles, error: unfinishedError } = await supabase.from("ag_daily_cycles")
    .select("id, cycle_date, updated_at")
    .eq("user_id", user.id).eq("portfolio_id", portfolio.id)
    .eq("strategy_era_id", era.id).eq("status", "running")
    .lt("cycle_date", cycleDate).order("cycle_date", { ascending: false }).limit(1);
  if (unfinishedError) throw new Error(`Unable to inspect earlier AG cycles: ${unfinishedError.message}`);
  const previousUnfinishedCycle = unfinishedCycles?.[0] ?? null;
  const previousCycleInactivityMinutes = previousUnfinishedCycle
    ? (Date.now() - Date.parse(previousUnfinishedCycle.updated_at)) / 60000 : null;
  const previousCycleStalled = previousCycleInactivityMinutes !== null && previousCycleInactivityMinutes >= 7;

  // Read-only inventory for an earlier unfinished cycle. Never infer safe retry
  // from zero rows: legacy persistence may not have emitted ledger entries.
  let previousCycleReconciliation: {
    stageCheckpoints: number; symbolCheckpoints: number;
    watchWriteRecords: number; decisionWriteRecords: number;
    attributedDecisionCount: number; decisionInventoryTruncated: boolean;
  } | null = null;
  if (previousUnfinishedCycle) {
    const cycleId = previousUnfinishedCycle.id;
    // This ID was obtained through the authenticated, portfolio-scoped query above.
    // Audit ledgers have RLS enabled with no user SELECT policy; query only this
    // verified cycle through the server-only admin client to avoid false zero counts.
    const auditClient = createAdminClient();
    const tables = [
      "ag_cycle_stage_checkpoints",
      "ag_cycle_symbol_checkpoints",
      "ag_cycle_watch_writes",
      "ag_cycle_decision_writes",
    ] as const;
    const counts: number[] = [];
    for (const table of tables) {
      const { count, error: countError } = await auditClient.from(table)
        .select("id", { count: "exact", head: true }).eq("cycle_id", cycleId);
      if (countError) throw new Error(`Unable to inspect ${table}: ${countError.message}`);
      counts.push(count ?? 0);
    }
    const { data: previousDecisions, error: previousDecisionError } = await supabase
      .from("investment_decisions").select("id, notes")
      .eq("user_id", user.id).eq("portfolio_id", portfolio.id)
      .eq("source", "ai_committee")
      .like("notes", `%"agCycleId":"${cycleId}"%`).limit(201);
    if (previousDecisionError) throw new Error(`Unable to inspect earlier cycle decisions: ${previousDecisionError.message}`);
    previousCycleReconciliation = {
      stageCheckpoints: counts[0], symbolCheckpoints: counts[1],
      watchWriteRecords: counts[2], decisionWriteRecords: counts[3],
      attributedDecisionCount: (previousDecisions ?? []).filter((row) => {
        try { return JSON.parse(row.notes ?? "{}").agCycleId === cycleId; }
        catch { return false; }
      }).length,
      decisionInventoryTruncated: (previousDecisions?.length ?? 0) > 200,
    };
  }

  const stageMarker = cycle?.failure_message?.match(/^AG_PERSISTENCE_IN_PROGRESS:([a-z_]+)$/)?.[1] ?? null;
  const failedStage = cycle?.failure_message?.match(/^AG_PERSISTENCE_STAGE_FAILED:([a-z_]+):/)?.[1] ?? null;
  const persistenceStage = stageMarker ?? failedStage;
  const persistenceStarted = Boolean(persistenceStage);
  const failedCompletedMarker = cycle?.failure_message?.match(/^AG_PERSISTENCE_STAGE_FAILED:[a-z_]+:LAST_COMPLETED:([a-z_]+):/)?.[1] ?? null;
  const completedStage = failedCompletedMarker && failedCompletedMarker !== "none"
    ? failedCompletedMarker.replace(/_completed$/, "")
    : persistenceStage?.endsWith("_completed") ? persistenceStage.slice(0, -"_completed".length) : null;
  const hasUnknownWriteHistory = Boolean(cycle && cycle.status === "failed" && !persistenceStarted);
  const stageMayBePartial = persistenceStarted && !persistenceStage?.endsWith("_completed");
  const { count: activeDecisionCount, error: decisionError } = cycle
    ? await supabase.from("investment_decisions").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("source", "ai_committee")
        .eq("status", "active").gte("created_at", cycle.started_at)
    : { count: null, error: null };
  if (decisionError) throw new Error(`Unable to inspect AG cycle decision records: ${decisionError.message}`);

  const { data: attributedDecisions, error: attributedError } = cycle
    ? await supabase.from("investment_decisions")
        .select("id, ticker, decision_type, status, transaction_id, created_at, notes")
        .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("source", "ai_committee")
        .like("notes", `%"agCycleId":"${cycle.id}"%`)
        .order("created_at", { ascending: true }).limit(200)
    : { data: null, error: null };
  if (attributedError) throw new Error(`Unable to reconcile attributed AG decisions: ${attributedError.message}`);
  const linkedDecisions = (attributedDecisions ?? []).filter((decision) => {
    try { return JSON.parse(decision.notes ?? "{}").agCycleId === cycle?.id; }
    catch { return false; }
  });

  const attributionIncomplete = (attributedDecisions?.length ?? 0) === 200;
  const attributionCountIsComplete = !attributionIncomplete && Boolean(cycle);
  const attributionCountMatchesPersisted = attributionCountIsComplete && cycle?.status === "completed" &&
    typeof cycle.persisted_decision_count === "number"
    ? linkedDecisions.length === cycle.persisted_decision_count
    : null;
  // Reused decisions are intentionally not rewritten with the new cycle ID, so
  // a count mismatch alone is never evidence of missing persistence.
  const decisionOrigins = linkedDecisions.reduce((counts, decision) => {
    try {
      const origin = JSON.parse(decision.notes ?? "{}").agDecisionOrigin;
      if (origin === "committee") counts.committee += 1;
      else if (origin === "holding_review") counts.holdingReview += 1;
      else counts.unknown += 1;
    } catch { counts.unknown += 1; }
    return counts;
  }, { committee: 0, holdingReview: 0, unknown: 0 });
  const attributionCountGap = attributionCountIsComplete && cycle?.status === "completed" &&
    typeof cycle.persisted_decision_count === "number"
    ? cycle.persisted_decision_count - linkedDecisions.length : null;
  const attributedTransactionCount = linkedDecisions.filter((decision) => Boolean(decision.transaction_id)).length;
  const attributedSupersededCount = linkedDecisions.filter((decision) => decision.status === "superseded").length;
  const decisionStageReached = persistenceStage === "holding_decisions" || persistenceStage === "committee_decisions" ||
    persistenceStage === "paper_execution" || persistenceStage === "paper_execution_completed" ||
    persistenceStage === "holding_decisions_completed" || persistenceStage === "committee_decisions_completed";
  const reconciliationAssessment = !cycle ? "no_cycle"
    : attributionIncomplete ? "inventory_truncated"
    : cycle.status === "completed" ? "cycle_completed"
    : cycle.status === "failed" && linkedDecisions.length > 0 ? "attributed_writes_found_review_required"
    : cycle.status === "failed" && decisionStageReached ? "decision_stage_reached_no_attributed_writes"
    : cycle.status === "failed" ? "write_history_unverified"
    : "cycle_not_failed";

  // A running row alone does not prove that the request is still alive.
  // Never automatically retry: a timed-out request may have made partial writes.
  const lastActivityAt = cycle?.updated_at ?? cycle?.started_at ?? null;
  const inactivityMinutes = lastActivityAt ? (Date.now() - Date.parse(lastActivityAt)) / 60000 : null;
  const stalled = cycle?.status === "running" && inactivityMinutes !== null && inactivityMinutes >= 7;

  return {
    cycleDate,
    previousUnfinishedCycle,
    previousCycleStalled,
    previousCycleReconciliation,
    stalled,
    lastActivityAt,
    hasCycleToday: Boolean(cycle),
    status: cycle?.status ?? "not_run",
    retryAvailable: false,
    reconciliation: {
      persistenceStage,
      persistenceStarted,
      lastConfirmedCompletedStage: completedStage,
      stageMayBePartial,
      hasUnknownWriteHistory,
      activeDecisionsCreatedSinceCycleStart: activeDecisionCount,
      decisionCountIsCycleAttribution: false,
      attributedDecisionCount: linkedDecisions.length,
      attributionCountMatchesPersisted,
      attributionCountGap,
      attributionCountMismatchMayBeReuse: attributionCountMatchesPersisted === false,
      attributedDecisionOrigins: decisionOrigins,
      attributedDecisionsWithTransactions: attributedTransactionCount,
      attributedSupersededDecisions: attributedSupersededCount,
      reusedDecisionAttributionAvailable: false,
      reusedDecisionCheckpointSupport: "schema_change_required",
      reusedDecisionCheckpointReason: "Existing symbol checkpoints permit only catalyst_deep_research and committee parent stages; decision_persistence is not allowed.",
      reconciliationAssessment,
      attributedDecisionScanLimit: 200,
      attributedDecisionScanMayBeTruncated: (attributedDecisions?.length ?? 0) === 200,
      attributedDecisions: linkedDecisions.map(({ id, ticker, decision_type, status, transaction_id, created_at }) => ({
        id, ticker, decisionType: decision_type, status, hasTransaction: Boolean(transaction_id), createdAt: created_at,
      })),
      recoveryState: previousUnfinishedCycle
        ? "previous_cycle_requires_reconciliation"
        : cycle?.status === "failed"
        ? "manual_review_required"
        : cycle?.status === "running" && persistenceStarted
          ? "persistence_in_progress_or_interrupted"
          : "not_applicable",
      automaticRetryPermitted: false,
    },
    retryBlockedReason: previousUnfinishedCycle
      ? "An earlier Accelerated Growth cycle is unfinished. Reconcile it before starting new discovery."
      : stalled ? "No progress recorded for at least seven minutes. Review the cycle before retrying; some work may have been saved." : cycle?.status === "failed"
      ? "AG cycle retries require reconciliation because prior persistence may be partial."
      : null,
    executionEnabled: false,
    transactionsWrittenByCycle: false,
    cycle: cycle ?? null,
  };
}
