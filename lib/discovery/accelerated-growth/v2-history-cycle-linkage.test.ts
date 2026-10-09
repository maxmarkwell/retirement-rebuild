import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { verifyV2HistoricalCycleLinkage } from "./v2-history-cycle-linkage";
import type { V2HistoryCaptureEnvelope } from "./v2-history-capture";
import type { V2ArchivedSource } from "./v2-history-source-archive";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const asOf = "2026-08-02T12:00:00Z";
const cycle = {
  pipelineVersion: "ag-opportunity-v2" as const, runId: "linkage_001",
  capacity: 1, capturedAt: "2026-08-03T12:00:00Z", researchAsOf: asOf,
  v1SelectedSymbols: ["AAA"], candidates: [{
    symbol: "AAA", origin: "NEW_DISCOVERY" as const,
    assessments: [{ version: "ag-opportunity-v2" as const,
      path: "CATALYST" as const, status: "QUALIFIED" as const,
      evidenceCoverage: 90, evidenceStrength: null, supportingFacts: [],
      contradictingFacts: [], missingCriticalEvidence: [],
      economicMechanism: "fixture", invalidationConditions: [] }],
  }],
};
const identity = { symbol: "AAA", issuerId: "CIK-123",
  effectiveAt: "2026-07-01T00:00:00Z" };
const envelope: V2HistoryCaptureEnvelope = {
  schemaVersion: "ag-history-capture-v1",
  sourceRevision: "a".repeat(40), capturedBy: "operator-1",
  reviewedBy: "reviewer-2", sourceManifestSha256: "",
  history: { pipelineVersion: "ag-opportunity-v2", cycles: [cycle],
    issuerIdentitiesByCycle: [[identity]] },
};
const records = [
  { kind: "V1_CYCLE" as const, id: "v1", value: {
    runId: cycle.runId, capacity: 1, researchAsOf: asOf, selectedSymbols: ["AAA"] } },
  { kind: "UNIVERSE" as const, id: "universe", value: {
    runId: cycle.runId, researchAsOf: asOf, symbols: ["AAA"] } },
  { kind: "ISSUER_MAPPING" as const, id: "identity", value: {
    runId: cycle.runId, researchAsOf: asOf, identities: [identity] } },
];
function check(data: typeof records, cycleOverride = cycle) {
  const payloads = data.map(x => ({ id: x.id, utf8: JSON.stringify(x.value) }));
  const sources: V2ArchivedSource[] = data.map((x, i) => ({
    id: x.id, kind: x.kind, sha256: hash(payloads[i].utf8),
    publishedAt: "2026-08-01T00:00:00Z",
    retrievedAt: "2026-08-02T00:00:00Z",
    sourceUrl: "https://example.org/" + x.id,
  }));
  const manifest = JSON.stringify({
    schemaVersion: "ag-history-source-manifest-v1",
    researchAsOf: asOf, sources,
  });
  return verifyV2HistoricalCycleLinkage({
    ...envelope, sourceManifestSha256: hash(manifest),
    history: { ...envelope.history, cycles: [cycleOverride] },
  }, manifest, payloads);
}
assert.deepEqual(check(records), { accepted: true, issues: [] });
function rejected(data: typeof records, issue: string) {
  const result = check(data);
  assert.equal(result.accepted, false);
  assert.ok(result.issues.includes(issue), issue + ":" + result.issues);
}
rejected(records.map(x => x.id === "v1" ? {
  ...x, value: { ...x.value, selectedSymbols: ["BBB"] },
} : x) as typeof records, "LINKAGE_V1_MISMATCH");
rejected(records.map(x => x.id === "universe" ? {
  ...x, value: { ...x.value, symbols: ["BBB"] },
} : x) as typeof records, "LINKAGE_UNIVERSE_MISMATCH");
rejected(records.map(x => x.id === "identity" ? {
  ...x, value: { ...x.value, identities: [{
    ...identity, issuerId: "CIK-999" }] },
} : x) as typeof records, "LINKAGE_ISSUER_MISMATCH");
rejected([...records, { ...records[0], id: "duplicate" }],
  "LINKAGE_SOURCE_KIND_COUNT:V1_CYCLE");
const invalid = check(records, { ...cycle, runId: "linkage_002" });
assert.equal(invalid.accepted, false);
if (!invalid.accepted) assert.ok(invalid.issues.includes("LINKAGE_V1_MISMATCH"));
