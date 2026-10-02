import "server-only";
import { createClient } from "@/lib/supabase/server";
import { denverAgCycleDate } from "./daily-cycle";

// Detection only: never automatically retry a possibly partially persisted cycle.
export const AG_STALE_CYCLE_MS = 20 * 60 * 1000;

export function isAgCycleStale(cycle: { status: string; started_at: string | null }, now = Date.now()) {
  if (cycle.status !== "running" || !cycle.started_at) return false;
  const started = Date.parse(cycle.started_at);
  return Number.isFinite(started) && now - started > AG_STALE_CYCLE_MS;
}

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

  const { data: recentCycles, error: recentError } = await supabase.from("ag_daily_cycles")
    .select("id, cycle_date, status, started_at, completed_at")
    .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id)
    .order("started_at", { ascending: false }).limit(15);
  if (recentError) throw new Error(`Unable to load recent AG cycle diagnostics: ${recentError.message}`);
  const staleCycles = (recentCycles ?? []).filter(isAgCycleStale).map((item) => ({
    id: item.id, cycleDate: item.cycle_date, startedAt: item.started_at,
  }));

  return {
    cycleDate,
    hasCycleToday: Boolean(cycle),
    status: cycle?.status ?? "not_run",
    retryAvailable: cycle?.status === "failed",
    staleCycleDetected: cycle ? isAgCycleStale(cycle) : false,
    requiresManualRecoveryReview: staleCycles.length > 0,
    staleCycles,
    executionEnabled: false,
    transactionsWrittenByCycle: false,
    cycle: cycle ?? null,
  };
}
