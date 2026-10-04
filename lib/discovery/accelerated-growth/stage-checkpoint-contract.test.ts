import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { precedingAgStage, validateAgStageEnvelope } from "./stage-checkpoint-contract";

const cycleId = "123e4567-e89b-42d3-a456-426614174000";
const valid = {
  version: 1, cycleId, stage: "discovery",
  completedAt: "2026-10-04T12:00:00.000Z", payload: { evaluatedCount: 3 },
};

describe("AG checkpoint envelope", () => {
  it("accepts a matching envelope", () => {
    assert.deepEqual(validateAgStageEnvelope(valid, { cycleId, stage: "discovery" }).payload, { evaluatedCount: 3 });
  });
  it("rejects mismatched or malformed checkpoints", () => {
    for (const value of [
      { ...valid, cycleId: "123e4567-e89b-42d3-a456-426614174001" },
      { ...valid, stage: "committee" },
      { ...valid, version: 2 },
      { ...valid, payload: [] },
      { ...valid, completedAt: "not-a-date" },
    ]) {
      assert.throws(() => validateAgStageEnvelope(value, { cycleId, stage: "discovery" }));
    }
  });
  it("enforces stage order", () => {
    assert.equal(precedingAgStage("holding_review"), null);
    assert.equal(precedingAgStage("discovery"), "holding_review");
    assert.equal(precedingAgStage("persistence"), "committee");
  });
});
