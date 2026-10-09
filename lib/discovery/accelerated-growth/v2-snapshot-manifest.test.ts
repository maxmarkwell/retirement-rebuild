import { strict as assert } from "node:assert";
import { verifyV2SnapshotManifests, type V2SnapshotManifest } from "./v2-snapshot-manifest";
const v1: V2SnapshotManifest = { version: "v1", snapshotId: "cycle_v1",
  capturedAt: "2026-10-08T20:00:00Z", universeId: "universe_42",
  universeSymbols: ["MSFT", "ADBE"], researchAsOf: "2026-10-08T19:00:00Z" };
const v2: V2SnapshotManifest = { ...v1, version: "v2",
  snapshotId: "cycle_v2", capturedAt: "2026-10-08T20:30:00Z",
  universeSymbols: ["ADBE", "MSFT"] };
assert.deepEqual(verifyV2SnapshotManifests(v1, v2, ["MSFT", "ADBE"]), { valid: true, issues: [] });
assert.ok(verifyV2SnapshotManifests(v1, { ...v2,
  capturedAt: "2026-10-08T22:00:01Z" }, ["MSFT", "ADBE"]).issues.includes("SHADOW_CAPTURE_TIME_SKEW"));
assert.ok(verifyV2SnapshotManifests(v1, { ...v2,
  researchAsOf: "2026-10-08T19:30:00Z" }, ["MSFT", "ADBE"]).issues.includes("SHADOW_RESEARCH_ASOF_MISMATCH"));
assert.ok(verifyV2SnapshotManifests(v1, { ...v2,
  universeSymbols: ["MSFT", "GOOG"] }, ["MSFT", "ADBE"]).issues.includes("SHADOW_UNIVERSE_MISMATCH"));
assert.ok(verifyV2SnapshotManifests(v1, v2, ["MSFT"]).issues.includes("SHADOW_ROW_COVERAGE_MISMATCH"));
assert.ok(verifyV2SnapshotManifests(v1, { ...v2,
  universeSymbols: ["MSFT", "MSFT"] }, ["MSFT", "ADBE"]).issues.includes("SHADOW_INVALID_UNIVERSE:v2"));
assert.ok(verifyV2SnapshotManifests(v1, { ...v2,
  capturedAt: "2026-02-30T20:30:00Z" }, ["MSFT", "ADBE"]).issues.includes("SHADOW_MANIFEST_INVALID_TIME"));
