import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgDiscoveryResult } from "./discovery";

/** Load only a completed stage from the exact user's active AG cycle. */
export async function loadCompletedAgDiscovery(input: {
  cycleId: string;
  userId: string;
  portfolioId: string;
  strategyEraId: string;
}): Promise<AgDiscoveryResult> {
  const db = createAdminClient();
  const { data: cycle, error: cycleError } = await db.from("ag_daily_cycles")
    .select("id").eq("id", input.cycleId)
    .eq("user_id", input.userId)
    .eq("portfolio_id", input.portfolioId)
    .eq("strategy_era_id", input.strategyEraId)
    .eq("status", "running").maybeSingle();
  if (cycleError || !cycle) throw new Error("AG_DISCOVERY_INVALID_CYCLE_CONTEXT");

  const { data: row, error } = await db.from("ag_cycle_stage_checkpoints")
    .select("output").eq("cycle_id", input.cycleId)
    .eq("user_id", input.userId)
    .eq("portfolio_id", input.portfolioId)
    .eq("strategy_era_id", input.strategyEraId)
    .eq("stage", "discovery").eq("status", "completed").maybeSingle();
  if (error || !row || !row.output) throw new Error("AG_DISCOVERY_COMPLETED_CHECKPOINT_REQUIRED");
  const result = row.output as unknown as AgDiscoveryResult;
  if (!Array.isArray(result.candidates) || !Array.isArray(result.errors) ||
      !Number.isInteger(result.universeCount) || result.universeCount < 0 ||
      !Number.isInteger(result.preselectedCount) || result.preselectedCount < 0 ||
      !Number.isInteger(result.evaluatedCount) || result.evaluatedCount < 0 ||
      result.evaluatedCount !== result.candidates.length ||
      result.rateLimited || result.stoppedEarly || result.errors.length > 0) {
    throw new Error("AG_DISCOVERY_CHECKPOINT_INVALID_OR_INCOMPLETE");
  }
  return result;
}
