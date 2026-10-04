import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareAgRpcBatch, commitPreparedAgBatch, reconcileAgCommittedBatch, verifyAgBatchFromLedger, classifyAgAmbiguousBatch, AgAmbiguousWriteError, reportAgPartialBatch } from "./atomic-persistence-adapter";

const cycleId = "123e4567-e89b-42d3-a456-426614174000";
const claimToken = "223e4567-e89b-42d3-a456-426614174000";
const decisionId = "323e4567-e89b-42d3-a456-426614174000";
const base = {
  cycleId, symbol: " nvda ", kind: "committee" as const, decisionType: "buy",
  payload: { thesis: "Own for durable growth", confidence: 75, thesisClock: "12 months",
    agThesisValid: true, agLiquidityEligible: false, agEvidenceVersion: "v1" },
};
describe("AG isolated RPC adapter", () => {
  it("maps validated arguments without a caller-supplied payload hash", () => {
    const [call] = prepareAgRpcBatch([base], claimToken);
    assert.equal(call.p_ticker, "NVDA");
    assert.equal(call.p_claim_token, claimToken);
    assert.equal(call.p_ag_thesis_valid, true);
    assert.equal(call.p_ag_liquidity_eligible, false);
    assert.equal(call.p_ag_evidence_version, "v1");
    assert.equal(call.p_notes, null);
    assert.equal(Object.hasOwn(call, "p_payload_hash"), false);
  });
  it("rejects bad claim tokens, duplicates and malformed later items before any write", async () => {
    assert.throws(() => prepareAgRpcBatch([base], "invalid"));
    assert.throws(() => prepareAgRpcBatch([base, { ...base, symbol: "NVDA" }], claimToken));
    assert.throws(() => prepareAgRpcBatch([base, { ...base, symbol: "MSFT",
      payload: { ...base.payload, confidence: Number.NaN } }], claimToken));
    let calls = 0;
    const prepared = prepareAgRpcBatch([base], claimToken);
    await commitPreparedAgBatch(prepared, async () => { calls++; return decisionId; });
    assert.equal(calls, 1);
  });
  it("rejects mutated prepared calls before issuing any RPC", async () => {
    const prepared = prepareAgRpcBatch([base, { ...base, symbol: "MSFT" }], claimToken);
    const tampered = [{ ...prepared[0] }, { ...prepared[1], p_confidence: Number.NaN }];
    let invoked = 0;
    await assert.rejects(commitPreparedAgBatch(tampered, async () => {
      invoked++;
      return decisionId;
    }), /Invalid prepared AG RPC arguments/);
    assert.equal(invoked, 0);
    const duplicate = [prepared[0], { ...prepared[1], p_ticker: "NVDA" }];
    await assert.rejects(commitPreparedAgBatch(duplicate, async () => {
      invoked++;
      return decisionId;
    }), /Duplicate prepared AG RPC ticker/);
    assert.equal(invoked, 0);
  });
  it("stops on a failed RPC and does not invoke subsequent writes", async () => {
    const prepared = prepareAgRpcBatch([base, { ...base, symbol: "MSFT" },
      { ...base, symbol: "ADBE" }], claimToken);
    const seen: string[] = [];
    await assert.rejects(commitPreparedAgBatch(prepared, async (call) => {
      seen.push(call.p_ticker);
      if (call.p_ticker === "MSFT") throw new Error("Simulated ambiguous timeout");
      return decisionId;
    }), (error: unknown) => error instanceof AgAmbiguousWriteError &&
      error.ticker === "MSFT" && error.cause instanceof Error &&
      error.cause.message === "Simulated ambiguous timeout" &&
      error.acknowledged.length === 1 &&
      error.acknowledged[0].ticker === "NVDA" &&
      error.acknowledged[0].decisionId === decisionId);
    assert.deepEqual(seen, ["NVDA", "MSFT"]);
  });
  it("requires complete independent committed-ledger evidence", () => {
    const calls = prepareAgRpcBatch([base, { ...base, symbol: "MSFT" }], claimToken);
    const secondId = "423e4567-e89b-42d3-a456-426614174000";
    const row = (ticker: string, id: string) => ({
      cycle_id: cycleId, ticker, status: "committed",
      investment_decision_id: id, payload_hash: "a".repeat(64),
      decision_kind: "committee", user_id: cycleId,
      portfolio_id: cycleId, strategy_era_id: cycleId,
    });
    const valid = [row("NVDA", decisionId), row("MSFT", secondId)];
    const scope = { userId: cycleId, portfolioId: cycleId, strategyEraId: cycleId };
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId], valid, scope), "COMPLETE");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, decisionId],
      [valid[0], { ...valid[1], investment_decision_id: decisionId }], scope), "MANUAL_RECONCILIATION");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId],
      [valid[0], { ...valid[1], portfolio_id: secondId }], scope), "MANUAL_RECONCILIATION");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId], valid.slice(0, 1), scope), "MANUAL_RECONCILIATION");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId], [valid[0], valid[0]], scope), "MANUAL_RECONCILIATION");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId],
      [valid[0], { ...valid[1], status: "pending" }], scope), "MANUAL_RECONCILIATION");
    assert.equal(reconcileAgCommittedBatch(calls, [decisionId, secondId],
      [valid[0], { ...valid[1], investment_decision_id: decisionId }], scope), "MANUAL_RECONCILIATION");
  });
  it("uses scoped read-only ledger verification and fails closed on read errors", async () => {
    const calls = prepareAgRpcBatch([base], claimToken);
    const scope = { userId: cycleId, portfolioId: cycleId, strategyEraId: cycleId };
    let selected = 0;
    const complete = await verifyAgBatchFromLedger(calls, [decisionId], scope, async (query) => {
      selected++;
      assert.deepEqual(query, { cycleId, userId: cycleId, portfolioId: cycleId, strategyEraId: cycleId });
      return [{ cycle_id: cycleId, ticker: "NVDA", status: "committed",
        investment_decision_id: decisionId, payload_hash: "a".repeat(64),
        decision_kind: "committee", user_id: cycleId,
        portfolio_id: cycleId, strategy_era_id: cycleId }];
    });
    assert.equal(complete, "COMPLETE");
    assert.equal(selected, 1);
    assert.equal(await verifyAgBatchFromLedger(calls, [decisionId], scope,
      async () => { throw new Error("Read timeout"); }), "MANUAL_RECONCILIATION");
    assert.equal(await verifyAgBatchFromLedger([], [], scope,
      async () => { selected++; return []; }), "MANUAL_RECONCILIATION");
    assert.equal(selected, 1);
  });
  it("classifies ambiguous timeout evidence without authorizing replay", () => {
    const calls = prepareAgRpcBatch([base], claimToken);
    const scope = { userId: cycleId, portfolioId: cycleId, strategyEraId: cycleId };
    const row = { cycle_id: cycleId, ticker: "NVDA", status: "committed",
      investment_decision_id: decisionId, payload_hash: "a".repeat(64),
      decision_kind: "committee", user_id: cycleId,
      portfolio_id: cycleId, strategy_era_id: cycleId };
    assert.equal(classifyAgAmbiguousBatch(calls, [row], scope),
      "ALL_RECORDED_REQUIRES_PAYLOAD_VERIFICATION");
    assert.equal(classifyAgAmbiguousBatch(calls, [], scope), "MANUAL_RECONCILIATION");
    const two = prepareAgRpcBatch([base, { ...base, symbol: "MSFT" }], claimToken);
    assert.equal(classifyAgAmbiguousBatch(two, [row, { ...row, ticker: "MSFT" }], scope),
      "MANUAL_RECONCILIATION");
    assert.equal(classifyAgAmbiguousBatch(calls, [{ ...row, portfolio_id: decisionId }], scope),
      "MANUAL_RECONCILIATION");
    assert.equal(classifyAgAmbiguousBatch(calls, [{ ...row, status: "pending" }], scope),
      "MANUAL_RECONCILIATION");
  });
  it("rejects an invalid decision ID rather than treating it as committed", async () => {
    const prepared = prepareAgRpcBatch([base], claimToken);
    await assert.rejects(commitPreparedAgBatch(prepared, async () => "not-a-uuid"),
      (error: unknown) => error instanceof AgAmbiguousWriteError && error.ticker === "NVDA");
  });
});

describe("AG partial-batch diagnostics", () => {
  it("separates acknowledged, unacknowledged, missing and conflicting evidence", () => {
    const calls = prepareAgRpcBatch([base, { ...base, symbol: "MSFT" },
      { ...base, symbol: "ADBE" }], claimToken);
    const scope = { userId: cycleId, portfolioId: cycleId, strategyEraId: cycleId };
    const row = (ticker: string, id: string) => ({
      cycle_id: cycleId, ticker, status: "committed",
      investment_decision_id: id, payload_hash: "a".repeat(64),
      decision_kind: "committee", user_id: cycleId,
      portfolio_id: cycleId, strategy_era_id: cycleId,
    });
    const ack = [{ ticker: "NVDA", decisionId }];
    const otherId = "423e4567-e89b-42d3-a456-426614174000";
    const report = reportAgPartialBatch(calls, ack,
      [row("NVDA", decisionId), row("MSFT", otherId)], scope);
    assert.deepEqual(report.acknowledged, ["NVDA"]);
    assert.deepEqual(report.recordedUnacknowledged, ["MSFT"]);
    assert.deepEqual(report.missing, ["ADBE"]);
    assert.deepEqual(report.conflicting, []);
    assert.equal(report.status, "REQUIRES_MANUAL_RECONCILIATION");
    const bad = reportAgPartialBatch(calls, ack,
      [row("NVDA", otherId), row("MSFT", otherId)], scope);
    assert.deepEqual(bad.conflicting.sort(), ["MSFT", "NVDA"]);
    assert.deepEqual(reportAgPartialBatch(calls, ack, [row("NVDA", decisionId),
      row("NVDA", decisionId)], scope).conflicting, ["NVDA"]);
  });
});
