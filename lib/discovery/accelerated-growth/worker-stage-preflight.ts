import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertAgWorkerCycleScope,
  assertAgWorkerStageEligible,
  type AgWorkerStage,
  type AgWorkerStageCheckpoint,
} from "./worker-stage-policy";

/** A server-only preflight. This does NOT claim a lease or execute research.
 * The atomic claim RPC is the final authority when worker execution is implemented.
 */
export async function inspectAgWorkerStage(input: {
  cycleId: string;
  stage: AgWorkerStage;
}) {
  const db = createAdminClient();
  const { data: cycle, error: cycleError } = await db.from("ag_daily_cycles")
    .select("id,user_id,portfolio_id,strategy_era_id,cycle_date,status")
    .eq("id", input.cycleId).single();
  if (cycleError || !cycle) throw new Error("AG_WORKER_CYCLE_NOT_FOUND");

  const { data: portfolio, error: portfolioError } = await db.from("portfolios")
    .select("id,user_id,type,is_real_money")
    .eq("id", cycle.portfolio_id).eq("user_id", cycle.user_id).single();
  if (portfolioError || !portfolio) throw new Error("AG_WORKER_PORTFOLIO_CONTEXT_MISMATCH");

  const { data: era, error: eraError } = await db.from("portfolio_strategy_eras")
    .select("id,user_id,portfolio_id,strategy_key,execution_mode,ended_at")
    .eq("id", cycle.strategy_era_id).eq("user_id", cycle.user_id)
    .eq("portfolio_id", cycle.portfolio_id).single();
  if (eraError || !era || era.ended_at !== null) {
    throw new Error("AG_WORKER_ERA_CONTEXT_MISMATCH");
  }

  const { data: prior, error: priorError } = await db.from("ag_daily_cycles")
    .select("id").eq("user_id", cycle.user_id).eq("portfolio_id", cycle.portfolio_id)
    .eq("strategy_era_id", cycle.strategy_era_id)
    .eq("status", "running").lt("cycle_date", cycle.cycle_date).limit(1);
  if (priorError) throw new Error("AG_WORKER_PRIOR_CYCLE_CHECK_FAILED");

  assertAgWorkerCycleScope({
    cycleStatus: cycle.status,
    portfolioType: portfolio.type,
    isRealMoney: portfolio.is_real_money,
    strategyKey: era.strategy_key,
    executionMode: era.execution_mode,
    hasEarlierUnfinishedCycle: (prior?.length ?? 0) > 0,
  });

  const { data: rows, error: stageError } = await db.from("ag_cycle_stage_checkpoints")
    .select("stage,status,output").eq("cycle_id", cycle.id)
    .eq("user_id", cycle.user_id).eq("portfolio_id", cycle.portfolio_id)
    .eq("strategy_era_id", cycle.strategy_era_id);
  if (stageError) throw new Error("AG_WORKER_CHECKPOINT_READ_FAILED");
  const checkpoints = (rows ?? []) as AgWorkerStageCheckpoint[];
  assertAgWorkerStageEligible({ stage: input.stage, checkpoints });

  return { cycleId: cycle.id, stage: input.stage, eligibleForAtomicClaim: true as const };
}
