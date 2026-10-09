import { strict as assert } from "node:assert";
import { runV2OfflineShadow } from "./v2-offline-shadow-run";
const base = {
  runId: "shadow_20261008", capturedAt: "2026-10-08T20:00:00Z",
  v1SnapshotId: "v1:cycle-1", v2SnapshotId: "v2:cycle-1",
  v1Manifest: { version: "v1" as const, snapshotId: "v1:cycle-1", capturedAt: "2026-10-08T20:00:00Z", universeId: "universe_1", universeSymbols: ["MSFT"], researchAsOf: "2026-10-08T19:00:00Z" },
  v2Manifest: { version: "v2" as const, snapshotId: "v2:cycle-1", capturedAt: "2026-10-08T20:15:00Z", universeId: "universe_1", universeSymbols: ["MSFT"], researchAsOf: "2026-10-08T19:00:00Z" },
  rows: [{ symbol: "MSFT", v1Status: "ADVANCE",
    v2Path: "ACCELERATING_FUNDAMENTALS", v2Gate: null }],
};
const ok = runV2OfflineShadow(base);
assert.equal(ok.accepted, true);
if (ok.accepted) {
  assert.equal(ok.summary.total, 1);
  assert.equal(ok.summary.outcomes.V2_EVIDENCE_GAP, 1);
}
assert.deepEqual(runV2OfflineShadow({ ...base, runId: "../danger" }),
  { accepted: false, issues: ["SHADOW_INVALID_RUN_ID"] });
assert.deepEqual(runV2OfflineShadow({ ...base, rows: [] }),
  { accepted: false, issues: ["SHADOW_INVALID_ROW_COUNT"] });
assert.deepEqual(runV2OfflineShadow({ ...base, v2SnapshotId: base.v1SnapshotId }),
  { accepted: false, issues: ["SHADOW_SNAPSHOTS_NOT_DISTINCT"] });
assert.deepEqual(runV2OfflineShadow({ ...base, rows: [base.rows[0], base.rows[0]] }),
  { accepted: false, issues: ["SHADOW_DUPLICATE_SYMBOL:MSFT"] });
assert.equal(runV2OfflineShadow({ ...base,
  rows: Array.from({ length: 501 }, (_, i) => ({ ...base.rows[0], symbol: "T" + i })) }).accepted, false);

const drift = runV2OfflineShadow({ ...base, v2Manifest: { ...base.v2Manifest, universeId: "other" } });
assert.equal(drift.accepted, false);
if (!drift.accepted) assert.ok(drift.issues.includes("SHADOW_UNIVERSE_ID_MISMATCH"));
