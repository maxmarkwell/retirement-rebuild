/** Durable stage-output format. Pure functions; no database or trading access.
 * Every completed stage must carry its identity and a nonempty payload.
 */
import { AG_WORKER_STAGES, type AgWorkerStage } from "./worker-stage-policy";

export const AG_WORKER_OUTPUT_VERSION = 1 as const;

export type AgWorkerStageOutput = {
  schemaVersion: typeof AG_WORKER_OUTPUT_VERSION;
  cycleId: string;
  stage: AgWorkerStage;
  producedAt: string;
  payload: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAgWorkerStageOutput(
  value: unknown,
  expected: { cycleId: string; stage: AgWorkerStage },
): AgWorkerStageOutput {
  if (!isRecord(value) || value.schemaVersion !== AG_WORKER_OUTPUT_VERSION) {
    throw new Error("AG_WORKER_OUTPUT_SCHEMA_UNSUPPORTED");
  }
  if (!UUID.test(expected.cycleId) || value.cycleId !== expected.cycleId ||
      value.stage !== expected.stage || !AG_WORKER_STAGES.includes(value.stage as AgWorkerStage)) {
    throw new Error("AG_WORKER_OUTPUT_IDENTITY_MISMATCH");
  }
  if (typeof value.producedAt !== "string" || !Number.isFinite(Date.parse(value.producedAt))) {
    throw new Error("AG_WORKER_OUTPUT_TIMESTAMP_INVALID");
  }
  if (!isRecord(value.payload) || Object.keys(value.payload).length === 0) {
    throw new Error("AG_WORKER_OUTPUT_PAYLOAD_REQUIRED");
  }
  // Validate JSON persistence compatibility before claiming durable success.
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("AG_WORKER_OUTPUT_NOT_JSON");
  }
  if (!serialized || serialized.includes('"payload":{}')) {
    throw new Error("AG_WORKER_OUTPUT_NOT_JSON");
  }
  return value as AgWorkerStageOutput;
}

export function makeAgWorkerStageOutput(input: {
  cycleId: string;
  stage: AgWorkerStage;
  payload: Record<string, unknown>;
  producedAt?: string;
}): AgWorkerStageOutput {
  return validateAgWorkerStageOutput({
    schemaVersion: AG_WORKER_OUTPUT_VERSION,
    cycleId: input.cycleId,
    stage: input.stage,
    producedAt: input.producedAt ?? new Date().toISOString(),
    payload: input.payload,
  }, { cycleId: input.cycleId, stage: input.stage });
}
