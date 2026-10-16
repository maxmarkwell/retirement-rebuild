/** Pure orchestration policy. No DB writes, scheduling, or trading side effects. */
export const AG_WORKER_STAGES = [
  "holding_review",
  "discovery",
  "catalyst_deep_research",
  "committee",
  "persistence",
  "finalized",
] as const;

export type AgWorkerStage = (typeof AG_WORKER_STAGES)[number];
export type AgWorkerStageStatus = "pending" | "running" | "completed" | "failed" | "needs_manual_review";

export type AgWorkerStageCheckpoint = {
  stage: AgWorkerStage;
  status: AgWorkerStageStatus;
  output: unknown | null;
};

export type AgWorkerCycleScope = {
  cycleStatus: string;
  portfolioType: string;
  isRealMoney: boolean;
  strategyKey: string;
  executionMode: string;
  hasEarlierUnfinishedCycle: boolean;
};

export function assertAgWorkerCycleScope(scope: AgWorkerCycleScope): void {
  if (scope.portfolioType !== "paper_active" || scope.isRealMoney ||
      scope.strategyKey !== "accelerated_growth" || scope.executionMode !== "paper") {
    throw new Error("AG_WORKER_PAPER_SCOPE_REQUIRED");
  }
  if (scope.hasEarlierUnfinishedCycle) throw new Error("AG_WORKER_PREVIOUS_CYCLE_REQUIRES_RECONCILIATION");
  if (scope.cycleStatus !== "running") throw new Error("AG_WORKER_CYCLE_NOT_RUNNING");
}

/** Check prerequisites before calling ag_worker_claim_stage.
 * The database RPC remains the authoritative atomic lease claim.
 * A completed predecessor must have committed output; missing output is not success.
 */
export function assertAgWorkerStageEligible(input: {
  stage: AgWorkerStage;
  cycleId: string;
  checkpoints: readonly AgWorkerStageCheckpoint[];
}): void {
  const index = AG_WORKER_STAGES.indexOf(input.stage);
  if (index < 0) throw new Error("AG_WORKER_INVALID_STAGE");
  const seen = new Set<AgWorkerStage>();
  for (const checkpoint of input.checkpoints) {
    if (seen.has(checkpoint.stage)) throw new Error("AG_WORKER_DUPLICATE_CHECKPOINT");
    seen.add(checkpoint.stage);
  }
  const current = input.checkpoints.find((checkpoint) => checkpoint.stage === input.stage);
  if (current) throw new Error("AG_WORKER_EXISTING_STAGE_REQUIRES_RECONCILIATION");
  for (const predecessor of AG_WORKER_STAGES.slice(0, index)) {
    const checkpoint = input.checkpoints.find((item) => item.stage === predecessor);
    if (!checkpoint || checkpoint.status !== "completed" || checkpoint.output === null ||
        checkpoint.output === undefined) {
      throw new Error("AG_WORKER_PREDECESSOR_NOT_DURABLE:" + predecessor);
    }
    const output = checkpoint.output;
    if (typeof output !== "object" || Array.isArray(output) ||
        (output as Record<string, unknown>).schemaVersion !== 1 ||
        (output as Record<string, unknown>).cycleId !== input.cycleId ||
        (output as Record<string, unknown>).stage !== predecessor ||
        typeof (output as Record<string, unknown>).producedAt !== "string" ||
        !Number.isFinite(Date.parse((output as Record<string, unknown>).producedAt as string)) ||
        typeof (output as Record<string, unknown>).payload !== "object" ||
        (output as Record<string, unknown>).payload === null ||
        Array.isArray((output as Record<string, unknown>).payload) ||
        Object.keys((output as Record<string, unknown>).payload as object).length === 0) {
      throw new Error("AG_WORKER_PREDECESSOR_OUTPUT_INVALID:" + predecessor);
    }
  }
}

/** Runtime executor must separately enforce valid lease-token fencing on every write. */
export function assertAgWorkerLeaseValid(input: {
  claimToken: string | null;
  expiresAt: string | null;
  now: Date;
}): void {
  if (!input.claimToken || !input.expiresAt ||
      !Number.isFinite(Date.parse(input.expiresAt)) ||
      Date.parse(input.expiresAt) <= input.now.getTime()) {
    throw new Error("AG_WORKER_LEASE_NOT_VALID");
  }
}
