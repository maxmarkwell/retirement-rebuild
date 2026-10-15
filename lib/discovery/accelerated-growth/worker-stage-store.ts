import "server-only";
import { validateAgWorkerStageOutput } from "./worker-stage-output";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assertAgWorkerCycleScope,
  assertAgWorkerStageEligible,
  type AgWorkerStage,
  type AgWorkerStageCheckpoint,
} from "./worker-stage-policy";

/** Server-only worker orchestration primitive. Not wired to an HTTP route.
 * Never creates cycles, resets failures, executes transactions, or changes legacy cycles.
 */
export async function claimAgWorkerStage(input: {
  cycleId: string;
  stage: AgWorkerStage;
  leaseSeconds?: number;
}): Promise<{ claimToken: string; cycleId: string; stage: AgWorkerStage }> {
  const admin = createAdminClient();
  const { data: cycle, error: cycleError } = await admin.from("ag_daily_cycles")
    .select("id,user_id,portfolio_id,strategy_era_id,cycle_date,status")
    .eq("id", input.cycleId).single();
  if (cycleError || !cycle) throw new Error("AG_WORKER_CYCLE_NOT_FOUND");

  const [{ data: portfolio, error: portfolioError }, { data: era, error: eraError },
    { data: previous, error: previousError }, { data: rows, error: rowsError }] = await Promise.all([
    admin.from("portfolios").select("id,user_id,type,is_real_money")
      .eq("id", cycle.portfolio_id).eq("user_id", cycle.user_id).single(),
    admin.from("portfolio_strategy_eras").select("id,user_id,portfolio_id,strategy_key,execution_mode,ended_at")
      .eq("id", cycle.strategy_era_id).eq("user_id", cycle.user_id)
      .eq("portfolio_id", cycle.portfolio_id).single(),
    admin.from("ag_daily_cycles").select("id")
      .eq("user_id", cycle.user_id).eq("portfolio_id", cycle.portfolio_id)
      .eq("strategy_era_id", cycle.strategy_era_id).eq("status", "running")
      .lt("cycle_date", cycle.cycle_date).limit(1),
    admin.from("ag_cycle_stage_checkpoints").select("stage,status,output")
      .eq("cycle_id", cycle.id),
  ]);
  if (portfolioError || eraError || previousError || rowsError ||
      !portfolio || !era || !rows || !previous) {
    throw new Error("AG_WORKER_SCOPE_INSPECTION_FAILED");
  }
  if (era.ended_at !== null) throw new Error("AG_WORKER_ERA_CLOSED");
  assertAgWorkerCycleScope({
    cycleStatus: cycle.status,
    portfolioType: portfolio.type,
    isRealMoney: portfolio.is_real_money,
    strategyKey: era.strategy_key,
    executionMode: era.execution_mode,
    hasEarlierUnfinishedCycle: previous.length > 0,
  });
  assertAgWorkerStageEligible({
    stage: input.stage,
    checkpoints: rows as AgWorkerStageCheckpoint[],
  });

  // The RPC atomically checks cycle status and lease availability again.
  // Its service-role-only grant is the authority, not this read preflight.
  const { data: claimToken, error: claimError } = await admin.rpc("ag_worker_claim_stage", {
    p_cycle_id: cycle.id,
    p_stage: input.stage,
    p_lease_seconds: input.leaseSeconds ?? 120,
  });
  if (claimError || typeof claimToken !== "string") {
    throw new Error("AG_WORKER_CLAIM_REJECTED:" + (claimError?.message ?? "missing token"));
  }
  return { claimToken, cycleId: cycle.id, stage: input.stage };
}

/** No side effects besides the RPC's fenced checkpoint completion.
 * Actual research/persistence writes must separately be fenced in the database.
 */
export async function completeAgWorkerStage(input: {
  cycleId: string;
  stage: AgWorkerStage;
  claimToken: string;
  output: Record<string, unknown>;
}): Promise<void> {
  if (!input.claimToken || !input.output || Array.isArray(input.output)) {
    throw new Error("AG_WORKER_COMPLETION_INVALID");
  }
  const validatedOutput = validateAgWorkerStageOutput(input.output, { cycleId: input.cycleId, stage: input.stage });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("ag_worker_complete_stage", {
    p_cycle_id: input.cycleId,
    p_stage: input.stage,
    p_token: input.claimToken,
    p_output: validatedOutput,
  });
  if (error || data !== true) throw new Error("AG_WORKER_COMPLETION_REJECTED:" + (error?.message ?? "lease invalid"));
}
