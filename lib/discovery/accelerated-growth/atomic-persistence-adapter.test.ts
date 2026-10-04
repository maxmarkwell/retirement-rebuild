import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareAgRpcBatch, commitPreparedAgBatch } from "./atomic-persistence-adapter";

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
    }), /Simulated ambiguous timeout/);
    assert.deepEqual(seen, ["NVDA", "MSFT"]);
  });
  it("rejects an invalid decision ID rather than treating it as committed", async () => {
    const prepared = prepareAgRpcBatch([base], claimToken);
    await assert.rejects(commitPreparedAgBatch(prepared, async () => "not-a-uuid"), /reconcile ledger/);
  });
});
