import { strict as assert } from "node:assert";
import { classifyV2ShadowOutcome, countV2ShadowOutcomes } from "./v2-shadow-outcomes";
assert.equal(classifyV2ShadowOutcome("ADVANCE", "ELIGIBLE"), "BOTH_POSITIVE");
assert.equal(classifyV2ShadowOutcome("ADVANCE", "NOT_QUALIFIED"), "V1_POSITIVE_V2_NEGATIVE");
assert.equal(classifyV2ShadowOutcome("REJECT", "ELIGIBLE"), "V1_NEGATIVE_V2_POSITIVE");
assert.equal(classifyV2ShadowOutcome("REJECT", "NOT_QUALIFIED"), "BOTH_NEGATIVE");
assert.equal(classifyV2ShadowOutcome("ADVANCE", "INSUFFICIENT_DATA"), "V2_EVIDENCE_GAP");
assert.equal(classifyV2ShadowOutcome("INSUFFICIENT", "ELIGIBLE"), "V1_EVIDENCE_GAP");
assert.equal(classifyV2ShadowOutcome("INSUFFICIENT", "INSUFFICIENT_DATA"), "BOTH_EVIDENCE_GAP");
assert.equal(classifyV2ShadowOutcome("REVIEW", "RISK_REVIEW"), "UNMAPPED");
assert.equal(classifyV2ShadowOutcome("WATCH", "ELIGIBLE"), "UNMAPPED");
assert.equal(classifyV2ShadowOutcome("ADVANCE", "RISK_REVIEW"), "UNMAPPED");
assert.equal(classifyV2ShadowOutcome("SOMETHING_UNKNOWN", "ELIGIBLE"), "UNMAPPED");
const counts = countV2ShadowOutcomes([
  { v1Status: "ADVANCE", v2Status: "ELIGIBLE" },
  { v1Status: "REJECT", v2Status: "ELIGIBLE" },
  { v1Status: "ADVANCE", v2Status: "INSUFFICIENT_DATA" },
]);
assert.equal(counts.BOTH_POSITIVE, 1);
assert.equal(counts.V1_NEGATIVE_V2_POSITIVE, 1);
assert.equal(counts.V2_EVIDENCE_GAP, 1);
assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 3);
