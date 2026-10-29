import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AgWorkerAuthorization = {
  cycleId: string;
  authorizationId: string;
  tokenHash: string;
};
export type AgResearchStage =
  | "holding_review" | "discovery" | "catalyst_deep_research"
  | "committee" | "persistence" | "finalized";

const STAGES: AgResearchStage[] = [
  "holding_review", "discovery", "catalyst_deep_research",
  "committee", "persistence", "finalized",
];

/**
 * Privileged server-only bridge to the existing authorization-bound SQL API.
 * Tokens must originate in the approved cycle authorization handoff, never
 * browser input; this module does not create credentials or expose a route.
 */
export async function getAgWorkerCheckpointStatus(auth: AgWorkerAuthorization) {
  const db = createAdminClient();
  const { data, error } = await db.rpc("ag_worker_read_cycle_checkpoint_status", {
    p_authorization_id: auth.authorizationId,
    p_cycle_id: auth.cycleId,
    p_token_hash: auth.tokenHash,
  });
  if (error || !data) throw new Error("AG_WORKER_CHECKPOINT_STATUS_UNAVAILABLE");
  return data as Array<{
    checkpoint_id: string; stage: AgResearchStage; status: string;
    attempt_count: number; lease_expires_at: string | null;
    completed_at: string | null;
  }>;
}

export async function claimAgWorkerStage(auth: AgWorkerAuthorization, stage: AgResearchStage) {
  if (!STAGES.includes(stage)) throw new Error("AG_WORKER_INVALID_STAGE");
  const rows = await getAgWorkerCheckpointStatus(auth);
  const stageIndex = STAGES.indexOf(stage);
  // No stage can begin until ALL preceding stages have completed. An
  // incomplete/failed/lost lease must be reconciled, not automatically reclaimed.
  for (const prerequisite of STAGES.slice(0, stageIndex)) {
    if (rows.filter(row => row.stage === prerequisite && row.status === "completed").length !== 1) {
      throw new Error("AG_WORKER_STAGE_PREREQUISITE_UNCONFIRMED:" + prerequisite);
    }
  }
  if (rows.some(row => row.stage === stage)) {
    throw new Error("AG_WORKER_STAGE_ALREADY_CLAIMED_REQUIRES_REVIEW");
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("ag_worker_claim_cycle_stage", {
    p_authorization_id: auth.authorizationId,
    p_cycle_id: auth.cycleId,
    p_token_hash: auth.tokenHash,
    p_stage: stage,
  });
  const claim = Array.isArray(data) ? data[0] : null;
  if (error || !claim?.checkpoint_id || !claim?.claim_token) {
    throw new Error("AG_WORKER_STAGE_CLAIM_NOT_CONFIRMED");
  }
  return { checkpointId: claim.checkpoint_id as string, claimToken: claim.claim_token as string };
}

export async function completeAgWorkerStage(
  auth: AgWorkerAuthorization,
  stage: AgResearchStage,
  claim: { checkpointId: string; claimToken: string },
  output: unknown,
) {
  if (!STAGES.includes(stage) || output == null || typeof output !== "object") {
    throw new Error("AG_WORKER_INVALID_STAGE_OUTPUT");
  }
  const db = createAdminClient();
  const { data, error } = await db.rpc("ag_worker_complete_cycle_stage", {
    p_authorization_id: auth.authorizationId,
    p_cycle_id: auth.cycleId,
    p_token_hash: auth.tokenHash,
    p_checkpoint_id: claim.checkpointId,
    p_claim_token: claim.claimToken,
    p_output: output,
  });
  if (error || data !== true) throw new Error("AG_WORKER_STAGE_COMPLETION_UNCONFIRMED");
  return { cycleId: auth.cycleId, stage, status: "completed" as const };
}

export async function readCompletedAgWorkerStage(auth: AgWorkerAuthorization, stage: AgResearchStage) {
  if (!STAGES.includes(stage)) throw new Error("AG_WORKER_INVALID_STAGE");
  const db = createAdminClient();
  const { data, error } = await db.rpc("ag_worker_read_completed_stage_output", {
    p_authorization_id: auth.authorizationId,
    p_cycle_id: auth.cycleId,
    p_token_hash: auth.tokenHash,
    p_stage: stage,
  });
  if (error || !Array.isArray(data) || data.length !== 1 ||
      data[0].stage !== stage || data[0].output == null) {
    throw new Error("AG_WORKER_COMPLETED_STAGE_UNAVAILABLE");
  }
  return data[0].output as unknown;
}
