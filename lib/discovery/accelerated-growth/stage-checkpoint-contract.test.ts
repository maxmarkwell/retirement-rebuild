import { describe, expect, it } from "vitest";
import { precedingAgStage, validateAgStageEnvelope } from "./stage-checkpoint-contract";

const cycleId = "123e4567-e89b-42d3-a456-426614174000";
const valid = {
  version: 1, cycleId, stage: "discovery",
  completedAt: "2026-10-04T12:00:00.000Z", payload: { evaluatedCount: 3 },
};

describe("AG checkpoint envelope", () => {
  it("accepts a matching envelope", () => {
    expect(validateAgStageEnvelope(valid, { cycleId, stage: "discovery" }).payload).toEqual({ evaluatedCount: 3 });
  });
  it.each([
    [{ ...valid, cycleId: "123e4567-e89b-42d3-a456-426614174001" }, "discovery"],
    [{ ...valid, stage: "committee" }, "discovery"],
    [{ ...valid, version: 2 }, "discovery"],
    [{ ...valid, payload: [] }, "discovery"],
    [{ ...valid, completedAt: "not-a-date" }, "discovery"],
  ] as const)("rejects mismatched or malformed checkpoint %#", (value, stage) => {
    expect(() => validateAgStageEnvelope(value, { cycleId, stage })).toThrow();
  });
  it("enforces stage order", () => {
    expect(precedingAgStage("holding_review")).toBeNull();
    expect(precedingAgStage("discovery")).toBe("holding_review");
    expect(precedingAgStage("persistence")).toBe("committee");
  });
});
