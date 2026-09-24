import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AgDailyCycleCounts = {
  universeCount?: number;
  preselectedCount?: number;
  evaluatedCount?: number;
  discoveryAdvanceCount?: number;
  catalystSupportedCount?: number;
  deepResearchCompletedCount?: number;
  deepResearchFailedCount?: number;
  proceedCount?: number;
  committeeDecisionCount?: number;
  persistedDecisionCount?: number;
};

export type AgDailyCycleContext = {
  cycleId: string;
  cycleDate: string;
  portfolioId: string;
  strategyEraId: string;
  attempt: "created" | "retried";
};

export type RunAgDailyCycleInput<T> = {
  maxCandidates?: number;
  cycleDate?: string;
  retryFailed?: boolean;
  work: (context: AgDailyCycleContext) => Promise<{ result: T; counts?: AgDailyCycleCounts }>;
};

export function denverAgCycleDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function countPatch(counts: AgDailyCycleCounts = {}) {
  return {
    universe_count: counts.universeCount ?? 0,
    preselected_count: counts.preselectedCount ?? 0,
    evaluated_count: counts.evaluatedCount ?? 0,
    discovery_advance_count: counts.discoveryAdvanceCount ?? 0,
    catalyst_supported_count: counts.catalystSupportedCount ?? 0,
    deep_research_completed_count: counts.deepResearchCompletedCount ?? 0,
    deep_research_failed_count: counts.deepResearchFailedCount ?? 0,
    proceed_count: counts.proceedCount ?? 0,
    committee_decision_count: counts.committeeDecisionCount ?? 0,
    persisted_decision_count: counts.persistedDecisionCount ?? 0,
  };
}

export async function runAgDailyCycle<T>(input: RunAgDailyCycleInput<T>) {
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

  const cycleDate = input.cycleDate ?? denverAgCycleDate();
  const maxCandidates = input.maxCandidates ?? 5;
  const now = new Date().toISOString();

  const existing = await supabase.from("ag_daily_cycles")
    .select("id, status")
    .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).eq("cycle_date", cycleDate)
    .maybeSingle();
  if (existing.error) throw new Error(`Unable to inspect AG daily cycle: ${existing.error.message}`);

  let cycleId: string;
  let attempt: "created" | "retried";

  if (!existing.data) {
    const created = await supabase.from("ag_daily_cycles").insert({
      user_id: user.id, portfolio_id: portfolio.id, strategy_era_id: era.id,
      cycle_date: cycleDate, status: "running", max_candidates: maxCandidates,
      started_at: now, updated_at: now,
    }).select("id").single();
    if (created.error || !created.data) throw new Error(`Unable to create AG daily cycle: ${created.error?.message ?? "unknown error"}`);
    cycleId = created.data.id;
    attempt = "created";
  } else if (existing.data.status === "failed" && input.retryFailed) {
    const retried = await supabase.from("ag_daily_cycles").update({
      status: "running", max_candidates: maxCandidates, started_at: now, completed_at: null, failure_message: null,
      universe_count: null, preselected_count: null, evaluated_count: null, discovery_advance_count: null,
      catalyst_supported_count: null, deep_research_completed_count: null, deep_research_failed_count: null,
      proceed_count: null, committee_decision_count: null, persisted_decision_count: null, updated_at: now,
    }).eq("id", existing.data.id).eq("status", "failed").select("id").single();
    if (retried.error || !retried.data) throw new Error(`Unable to retry AG daily cycle: ${retried.error?.message ?? "unknown error"}`);
    cycleId = retried.data.id;
    attempt = "retried";
  } else {
    return { executed: false as const, cycleId: existing.data.id, cycleDate, status: existing.data.status, reason: "authoritative_cycle_already_exists" as const };
  }

  const context: AgDailyCycleContext = { cycleId, cycleDate, portfolioId: portfolio.id, strategyEraId: era.id, attempt };

  try {
    const work = await input.work(context);
    const completedAt = new Date().toISOString();
    const completed = await supabase.from("ag_daily_cycles").update({
      status: "completed", completed_at: completedAt, failure_message: null,
      ...countPatch(work.counts), updated_at: completedAt,
    }).eq("id", cycleId).eq("status", "running").select("id, status").single();
    if (completed.error || !completed.data) throw new Error(`Unable to complete AG daily cycle: ${completed.error?.message ?? "unknown error"}`);
    return { executed: true as const, cycleId, cycleDate, status: "completed" as const, attempt, result: work.result, counts: countPatch(work.counts) };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "AG daily cycle work failed.";
    await supabase.from("ag_daily_cycles").update({ status: "failed", completed_at: failedAt, failure_message: message, updated_at: failedAt })
      .eq("id", cycleId).eq("status", "running");
    throw error;
  }
}
