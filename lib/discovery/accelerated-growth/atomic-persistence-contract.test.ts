import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAgPersistenceRecovery, planAgDecisionWrites } from "./atomic-persistence-contract";

const cycleId = "123e4567-e89b-42d3-a456-426614174000";
const base = { cycleId, symbol: "NVDA", kind: "committee" as const, decisionType: "buy", payload: { thesis: "test" } };

describe("AG persistence planning", () => {
  it("produces stable cycle-linked idempotency keys", () => {
    assert.equal(planAgDecisionWrites([base])[0].idempotencyKey, `${cycleId}:NVDA`);
    assert.equal(planAgDecisionWrites([{ ...base, symbol: " nvda " }])[0].idempotencyKey, `${cycleId}:NVDA`);
    assert.equal(planAgDecisionWrites([{ ...base, cycleId: cycleId.toUpperCase() }])[0].cycleId, cycleId);
  });
  it("rejects duplicate tickers across decision kinds", () => {
    assert.throws(() => planAgDecisionWrites([base, { ...base, kind: "holding_review" }]));
  });
  it("rejects malformed cycle IDs and ticker symbols", () => {
    assert.throws(() => planAgDecisionWrites([{ ...base, cycleId: "not-a-cycle" }]));
    assert.throws(() => planAgDecisionWrites([{ ...base, symbol: "BAD TICKER" }]));
  });
  it("rejects malformed runtime values and incompatible decision kinds", () => {
    assert.throws(() => planAgDecisionWrites(null as unknown as Array<typeof base>));
    assert.throws(() => planAgDecisionWrites([{ ...base, symbol: null as unknown as string }]));
    assert.throws(() => planAgDecisionWrites([{ ...base, decisionType: 1 as unknown as string }]));
    assert.throws(() => planAgDecisionWrites([{ ...base, decisionType: "sell" }]));
    assert.throws(() => planAgDecisionWrites([{ ...base, kind: "holding_review", decisionType: "buy" }]));
    assert.throws(() => planAgDecisionWrites([{ ...base, decisionType: "  " }]));
  });
  it("requires manual reconciliation after an ambiguous timeout", () => {
    assert.equal(classifyAgPersistenceRecovery({ stageClaimed: true, completionConfirmed: false, databaseLedgerVerified: false }), "MANUAL_RECONCILIATION");
    assert.equal(classifyAgPersistenceRecovery({ stageClaimed: true, completionConfirmed: true, databaseLedgerVerified: false }), "MANUAL_RECONCILIATION");
    assert.equal(classifyAgPersistenceRecovery({ stageClaimed: true, completionConfirmed: true, databaseLedgerVerified: true }), "COMPLETE");
    assert.equal(classifyAgPersistenceRecovery({ stageClaimed: false, completionConfirmed: false, databaseLedgerVerified: false }), "NOT_STARTED");
  });
});
