/**
 * Conservative, side-effect-free gate for an interrupted AG worker.
 * A lease expiry is not evidence that an irreversible write did not occur.
 * This module must not itself retry or modify cycle records.
 */
export type AgWorkerRecoveryEvidence = {
  stage: "holding_review" | "discovery" | "catalyst_deep_research" | "committee" | "persistence" | "finalized";
  leaseExpired: boolean;
  writePhaseEntered: boolean;
  watchWriteRecords: number;
  decisionWriteRecords: number;
  attributedDecisions: number;
  inventoryComplete: boolean;
  checkpointOutputAvailable: boolean;
};

export type AgWorkerRecoveryDecision =
  | { action: "wait"; reason: string }
  | { action: "manual_review"; reason: string }
  | { action: "resume_read_only"; reason: string };

export function assessAgWorkerRecovery(e: AgWorkerRecoveryEvidence): AgWorkerRecoveryDecision {
  if (!e.leaseExpired) return { action: "wait", reason: "Worker lease is still active." };
  if (!e.inventoryComplete) return { action: "manual_review", reason: "Write inventory is incomplete." };
  if (e.writePhaseEntered || e.stage === "persistence" || e.stage === "finalized" ||
      e.watchWriteRecords > 0 || e.decisionWriteRecords > 0 || e.attributedDecisions > 0) {
    return { action: "manual_review", reason: "Persistence may have produced non-atomic writes." };
  }
  if (!e.checkpointOutputAvailable) {
    return { action: "manual_review", reason: "Research checkpoint output is missing; safe resume cannot be established." };
  }
  return { action: "resume_read_only", reason: "Only a verified read-only checkpoint can be resumed by a fenced worker." };
}
