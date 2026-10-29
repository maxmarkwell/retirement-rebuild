import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAcceleratedGrowthDiscovery } from "./discovery";

/**
 * First durable step of the forthcoming resumable AG worker.
 * No user-facing route calls this until stage orchestration is completed.
 * The service-role RPCs serialize claims; a lost/expired claim requires
 * reconciliation rather than automatic takeover.
 */
export async function runAgDiscoveryCheckpoint(input: {
  cycleId: string;
  userId: string;
  portfolioId: string;
  strategyEraId: string;
}) {
  const db = createAdminClient();
  const { data: cycle, error: lookupError } = await db.from("ag_daily_cycles")
    .select("id,user_id,portfolio_id,strategy_era_id,status")
    .eq("id", input.cycleId)
    .eq("user_id", input.userId)
    .eq("portfolio_id", input.portfolioId)
    .eq("strategy_era_id", input.strategyEraId)
    .maybeSingle();
  if (lookupError || !cycle || cycle.status !== "running") {
    throw new Error("AG_DISCOVERY_CYCLE_NOT_AUTHORIZED_OR_RUNNING");
  }
  const { data: portfolio, error: portfolioError } = await db.from("portfolios")
    .select("id").eq("id", input.portfolioId)
    .eq("user_id", input.userId).eq("type", "paper_active")
    .eq("is_real_money", false).maybeSingle();
  if (portfolioError || !portfolio) throw new Error("AG_DISCOVERY_PAPER_PORTFOLIO_REQUIRED");

  const { data: token, error: claimError } = await db.rpc("ag_worker_claim_stage", {
    p_cycle_id: input.cycleId, p_stage: "discovery", p_lease_seconds: 240,
  });
  if (claimError || !token) {
    throw new Error("AG_DISCOVERY_STAGE_CLAIM_REJECTED: manual reconciliation required");
  }

  // Read-only discovery. This function never persists a watchlist, decision,
  // brokerage transaction, or portfolio cash change.
  const { data: era, error: eraError } = await db.from("portfolio_strategy_eras")
    .select("inception_at").eq("id", input.strategyEraId)
    .eq("portfolio_id", input.portfolioId).eq("user_id", input.userId)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
    .is("ended_at", null).maybeSingle();
  if (eraError || !era) throw new Error("AG_DISCOVERY_OPEN_ERA_REQUIRED");
  const [priorWatches, committeeWatches] = await Promise.all([
    db.from("ag_research_watchlist").select("ticker")
      .eq("user_id", input.userId).eq("portfolio_id", input.portfolioId)
      .eq("strategy_era_id", input.strategyEraId).is("resolved_at", null)
      .order("last_seen_at", { ascending: true }).limit(5),
    db.from("investment_decisions").select("ticker")
      .eq("user_id", input.userId).eq("portfolio_id", input.portfolioId)
      .eq("source", "ai_committee").eq("decision_type", "watch")
      .eq("status", "active").gte("created_at", era.inception_at),
  ]);
  if (priorWatches.error || committeeWatches.error) throw new Error("AG_DISCOVERY_WATCH_READ_FAILED");
  const reassessSymbols = Array.from(new Set([
    ...(priorWatches.data ?? []).map(row => row.ticker.toUpperCase()),
    ...(committeeWatches.data ?? []).map(row => row.ticker.toUpperCase()),
  ]));
  const discovery = await runAcceleratedGrowthDiscovery({ reassessSymbols });
  if (discovery.errors.length || discovery.rateLimited || discovery.stoppedEarly) {
    throw new Error("AG_DISCOVERY_INCOMPLETE_REQUIRES_REVIEW");
  }
  const { data: completed, error: completeError } = await db.rpc("ag_worker_complete_stage", {
    p_cycle_id: input.cycleId,
    p_stage: "discovery",
    p_token: token,
    p_output: discovery,
  });
  if (completeError || completed !== true) {
    throw new Error("AG_DISCOVERY_CHECKPOINT_NOT_CONFIRMED: manual reconciliation required");
  }
  return { cycleId: input.cycleId, stage: "discovery" as const, status: "completed" as const,
    universeCount: discovery.universeCount, candidateCount: discovery.candidates.length };
}
