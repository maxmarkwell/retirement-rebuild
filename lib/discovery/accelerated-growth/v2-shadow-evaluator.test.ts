import { strict as assert } from "node:assert";
import { evaluateV2ShadowSnapshots } from "./v2-shadow-evaluator";
const input = [{ symbol: "MSFT", v1Status: "ADVANCE", v2Path: "ACCELERATING_FUNDAMENTALS",
  v2Gate: null }];
const result = evaluateV2ShadowSnapshots(input);
assert.deepEqual(result.issues, []);
assert.equal(result.total, 1);
assert.equal(result.v2Insufficient, 1);
assert.equal(result.rows[0].v2Status, "INSUFFICIENT_DATA");
assert.deepEqual(result.rows[0].v2Reasons, ["SHADOW_MISSING_V2_GATE"]);
assert.equal(result.comparableStatusTaxonomy, false);
assert.equal(input[0].v2Gate, null);
assert.equal(evaluateV2ShadowSnapshots([...input, input[0]]).rows.length, 0);

const inconsistent = evaluateV2ShadowSnapshots([{
  ...input[0],
  v2Gate: { eligible: true, status: "NOT_QUALIFIED", reasons: [],
    opportunity: {} as never, survival: null },
}]);
assert.equal(inconsistent.rows[0].v2Status, "INSUFFICIENT_DATA");
assert.deepEqual(inconsistent.rows[0].v2Reasons, ["SHADOW_INCONSISTENT_GATE_ELIGIBILITY"]);

const reverseInconsistent = evaluateV2ShadowSnapshots([{
  ...input[0],
  v2Gate: { eligible: false, status: "ELIGIBLE", reasons: [],
    opportunity: {} as never, survival: null },
}]);
assert.equal(reverseInconsistent.rows[0].v2Status, "INSUFFICIENT_DATA");
assert.deepEqual(reverseInconsistent.rows[0].v2Reasons, ["SHADOW_INCONSISTENT_GATE_ELIGIBILITY"]);
