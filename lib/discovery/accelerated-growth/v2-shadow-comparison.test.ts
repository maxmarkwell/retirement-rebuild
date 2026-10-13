import { strict as assert } from "node:assert";
import { summarizeV2Shadow } from "./v2-shadow-comparison";
const rows = [
  { symbol: "abc", v1Status: "ADVANCE", v2Status: "INSUFFICIENT_DATA",
    v2Path: "ACCELERATING_FUNDAMENTALS", v2Reasons: ["NO_VERIFIED_FILING"] },
  { symbol: "XYZ", v1Status: "WATCH", v2Status: "WATCH",
    v2Path: "TURNAROUND", v2Reasons: [] },
];
const summary = summarizeV2Shadow(rows);
assert.deepEqual(summary.issues, []);
assert.equal(summary.total, 2);
assert.equal(summary.agreement, 1);
assert.equal(summary.disagreements, 1);
assert.equal(summary.v2Insufficient, 1);
assert.equal(summary.rows[0].symbol, "ABC");
assert.equal(rows[0].symbol, "abc", "Shadow comparison must not mutate input");
assert.equal(summarizeV2Shadow([...rows, { ...rows[0], symbol: "ABC" }]).rows.length, 0);
assert.ok(summarizeV2Shadow([{ ...rows[0], symbol: "BAD SYMBOL" }]).issues.includes("SHADOW_INVALID_SYMBOL"));

const invalid = summarizeV2Shadow([...rows, { ...rows[0], symbol: "ABC" }]);
assert.equal(Object.values(invalid.outcomes).reduce((a, b) => a + b, 0), 0,
  "Invalid input must not publish misleading outcome counts");
assert.equal(summary.outcomes.V2_EVIDENCE_GAP, 1);
assert.equal(summary.outcomes.UNMAPPED, 1);
