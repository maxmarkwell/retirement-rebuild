import { strict as assert } from "node:assert";
import { assessAgWorkerRecovery, type AgWorkerRecoveryEvidence } from "./worker-recovery-policy";

const base: AgWorkerRecoveryEvidence = {
  stage: "committee", leaseExpired: true, writePhaseEntered: false,
  watchWriteRecords: 0, decisionWriteRecords: 0, attributedDecisions: 0,
  inventoryComplete: true, checkpointOutputAvailable: true,
};
assert.equal(assessAgWorkerRecovery({ ...base, leaseExpired: false }).action, "wait");
assert.equal(assessAgWorkerRecovery(base).action, "resume_read_only");
assert.equal(assessAgWorkerRecovery({ ...base, checkpointOutputAvailable: false }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, inventoryComplete: false }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, stage: "persistence" }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, writePhaseEntered: true }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, watchWriteRecords: 1 }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, decisionWriteRecords: 1 }).action, "manual_review");
assert.equal(assessAgWorkerRecovery({ ...base, attributedDecisions: 1 }).action, "manual_review");
console.log("AG worker recovery policy fixtures passed");
