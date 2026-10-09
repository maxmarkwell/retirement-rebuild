/**
 * Structural validation at the checkpoint trust boundary. This deliberately
 * does not treat a valid payload as authorization to persist decisions.
 */
export const AG_STAGE_ORDER = [
  "holding_review", "discovery", "catalyst_deep_research",
  "committee", "persistence", "finalized",
] as const;

export type AgStage = (typeof AG_STAGE_ORDER)[number];

export function isAgStage(value: unknown): value is AgStage {
  return typeof value === "string" && AG_STAGE_ORDER.some((stage) => stage === value);
}

export type AgStageEnvelope = {
  version: 1;
  cycleId: string;
  stage: AgStage;
  completedAt: string;
  payload: Record<string, unknown>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateAgStageEnvelope(
  value: unknown,
  expected: { cycleId: string; stage: AgStage }
): AgStageEnvelope {
  if (!isRecord(value) || value.version !== 1 ||
      value.cycleId !== expected.cycleId || !UUID.test(expected.cycleId) ||
      value.stage !== expected.stage || !isAgStage(value.stage) ||
      typeof value.completedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value.completedAt) ||
      !Number.isFinite(Date.parse(value.completedAt)) ||
      !isRecord(value.payload)) {
    throw new Error("Invalid AG checkpoint envelope; cycle, stage and payload must match.");
  }
  // An envelope alone is insufficient to validate stage-specific decision
  // schemas or to authorize the non-atomic legacy persistence path.
  return value as AgStageEnvelope;
}

export function precedingAgStage(stage: AgStage): AgStage | null {
  const index = AG_STAGE_ORDER.indexOf(stage);
  return index === 0 ? null : AG_STAGE_ORDER[index - 1];
}
