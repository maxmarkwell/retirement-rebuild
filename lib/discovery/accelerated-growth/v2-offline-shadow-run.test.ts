import { strict as assert } from "node:assert";
import { runV2OfflineShadow } from "./v2-offline-shadow-run";
const base = {
  runId: "shadow_20261008", capturedAt: "2026-10-08T20:00:00Z",
  v1SnapshotId: "v1:cycle-1", v2SnapshotId: "v2:cycle-1",
  v1Manifest: { version: "v1" as const, snapshotId: "v1:cycle-1", capturedAt: "2026-10-08T20:00:00Z", universeId: "universe_1", universeSymbols: ["MSFT"], researchAsOf: "2026-10-08T19:00:00Z", pipelineVersion: "ag-v1", fiscalPeriod: "2026-Q3" },
  v2Manifest: { version: "v2" as const, snapshotId: "v2:cycle-1", pipelineVersion: "ag-v2", fiscalPeriod: "2026-Q3", capturedAt: "2026-10-08T20:15:00Z", universeId: "universe_1", universeSymbols: ["MSFT"], researchAsOf: "2026-10-08T19:00:00Z" },
  reconciliationTolerances: { revenue: 0.5 },
  evidence: [{ symbol: "MSFT", issuerId: "CIK-0000000001", fiscalPeriod: "2026-Q3", observations: [{
    metric: "revenue", value: 100, unit: "USD" as const, fiscalPeriod: "2026-Q3",
    issuerId: "CIK-0000000001", documentId: "sec-q3", extractionId: "extract-q3",
    source: { url: "https://www.sec.gov/filing", publisher: "SEC",
      publishedAt: "2026-10-01", retrievedAt: "2026-10-02",
      fiscalPeriod: "2026-Q3", metric: "revenue", kind: "FILING" as const },
  }] }],
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
const noRows = runV2OfflineShadow({ ...base, rows: [] });
assert.equal(noRows.accepted, false);
if (!noRows.accepted) assert.ok(noRows.issues.includes("SHADOW_INVALID_ROW_COUNT"));
const sameId = runV2OfflineShadow({ ...base, v2SnapshotId: base.v1SnapshotId });
assert.equal(sameId.accepted, false);
if (!sameId.accepted) assert.ok(sameId.issues.includes("SHADOW_SNAPSHOTS_NOT_DISTINCT"));
const duplicateRows = runV2OfflineShadow({ ...base, rows: [base.rows[0], base.rows[0]] });
assert.equal(duplicateRows.accepted, false);
if (!duplicateRows.accepted) assert.ok(duplicateRows.issues.includes("SHADOW_INVALID_UNIVERSE:rows"));
assert.equal(runV2OfflineShadow({ ...base,
  rows: Array.from({ length: 501 }, (_, i) => ({ ...base.rows[0], symbol: "T" + i })) }).accepted, false);

const drift = runV2OfflineShadow({ ...base, v2Manifest: { ...base.v2Manifest, universeId: "other" } });
assert.equal(drift.accepted, false);
if (!drift.accepted) assert.ok(drift.issues.includes("SHADOW_UNIVERSE_ID_MISMATCH"));

const missingEvidence = runV2OfflineShadow({ ...base, evidence: [] });
assert.equal(missingEvidence.accepted, false);
if (!missingEvidence.accepted) assert.ok(missingEvidence.issues.includes("SHADOW_EVIDENCE_COVERAGE_MISMATCH"));
const lookahead = runV2OfflineShadow({ ...base, evidence: [{
  ...base.evidence[0], observations: [{ ...base.evidence[0].observations[0],
    source: { ...base.evidence[0].observations[0].source, retrievedAt: "2026-10-09" } }],
}] });
assert.equal(lookahead.accepted, false);
if (!lookahead.accepted) assert.ok(lookahead.issues.includes("SHADOW_EVIDENCE_LOOKAHEAD:MSFT:revenue"));

const vendor = { ...base.evidence[0].observations[0], value: 100.1,
  documentId: "vendor-q3", extractionId: "extract-vendor-q3",
  source: { ...base.evidence[0].observations[0].source,
    kind: "MARKET_DATA" as const, publisher: "Vendor",
    url: "https://example.org/financials" } };
const corroborated = runV2OfflineShadow({ ...base, evidence: [{
  ...base.evidence[0], observations: [...base.evidence[0].observations, vendor],
}] });
assert.equal(corroborated.accepted, true);
const disagreement = runV2OfflineShadow({ ...base, evidence: [{
  ...base.evidence[0], observations: [...base.evidence[0].observations,
    { ...vendor, value: 120 }],
}] });
assert.equal(disagreement.accepted, false);
if (!disagreement.accepted) assert.ok(disagreement.issues.some(x => x.includes("VALUE_DISAGREEMENT")));

const excessiveTolerance = runV2OfflineShadow({ ...base,
  reconciliationTolerances: { revenue: 1000 },
  evidence: [{ ...base.evidence[0], observations: [
    ...base.evidence[0].observations, { ...vendor, value: 120 },
  ] }],
});
assert.equal(excessiveTolerance.accepted, false);
if (!excessiveTolerance.accepted)
  assert.ok(excessiveTolerance.issues.includes("SHADOW_EXCESSIVE_TOLERANCE:MSFT:revenue"));
