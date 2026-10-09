import { strict as assert } from "node:assert";
import { verifyV2HistoryCapture, type V2HistoryCaptureEnvelope } from "./v2-history-capture";
const assessment = {
  version: "ag-opportunity-v2" as const, path: "CATALYST" as const,
  status: "QUALIFIED" as const, evidenceCoverage: 90, evidenceStrength: null,
  supportingFacts: [], contradictingFacts: [], missingCriticalEvidence: [],
  economicMechanism: "fixture", invalidationConditions: [],
};
const cycle = {
  pipelineVersion: "ag-opportunity-v2" as const,
  runId: "capture_001", capacity: 1,
  capturedAt: "2026-08-03T12:00:00Z", researchAsOf: "2026-08-02T12:00:00Z",
  v1SelectedSymbols: ["AAA"],
  candidates: [{ symbol: "AAA", origin: "NEW_DISCOVERY" as const,
    assessments: [assessment] }],
};
const base: V2HistoryCaptureEnvelope = {
  schemaVersion: "ag-history-capture-v1",
  sourceRevision: "a".repeat(40), capturedBy: "operator-1",
  reviewedBy: "reviewer-2", sourceManifestSha256: "b".repeat(64),
  history: { pipelineVersion: "ag-opportunity-v2", cycles: [cycle],
    issuerIdentitiesByCycle: [[{
      symbol: "AAA", issuerId: "CIK-123", effectiveAt: "2026-07-01T00:00:00Z",
    }]] },
};
const verified = verifyV2HistoryCapture(base);
assert.equal(verified.accepted, true);
if (verified.accepted) {
  assert.equal(verified.sha256.length, 64);
  assert.equal(verified.cycleCount, 1);
  assert.equal(verified.issuerCount, 1);
  const reordered = verifyV2HistoryCapture({
    ...base, history: { ...base.history, cycles: [...base.history.cycles] },
  });
  assert.deepEqual(reordered, verified);
  const changed = verifyV2HistoryCapture({
    ...base, sourceManifestSha256: "c".repeat(64),
  });
  assert.equal(changed.accepted, true);
  if (changed.accepted) assert.notEqual(changed.sha256, verified.sha256);
}
function rejects(value: V2HistoryCaptureEnvelope, issue: string) {
  const result = verifyV2HistoryCapture(value);
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.ok(result.issues.includes(issue), issue);
}
rejects({ ...base, sourceRevision: "bad" }, "CAPTURE_INVALID_REVISION");
rejects({ ...base, sourceManifestSha256: "bad" }, "CAPTURE_INVALID_SOURCE_MANIFEST");
rejects({ ...base, reviewedBy: base.capturedBy }, "CAPTURE_INVALID_REVIEWERS");
rejects({ ...base, schemaVersion: "wrong" as typeof base.schemaVersion },
  "CAPTURE_INVALID_SCHEMA");
rejects({ ...base, history: { ...base.history, issuerIdentitiesByCycle: [] } },
  "IDENTITY_CYCLE_COUNT_MISMATCH");
rejects({ ...base, history: { ...base.history, cycles: [{
  ...cycle, candidates: [{ ...cycle.candidates[0],
    assessments: [{ ...assessment, evidenceCoverage: Number.NaN }] }],
}] } }, "HISTORY_CYCLE_0:RESEARCH_INVALID_ASSESSMENT:AAA");
