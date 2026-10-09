import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { verifyV2HistoricalArchiveBatch, type V2HistoricalCycleArchive } from "./v2-history-archive-batch";
import type { V2ArchivedSource } from "./v2-history-source-archive";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const identity = { symbol: "AAA", issuerId: "CIK-123",
  effectiveAt: "2026-07-01T00:00:00Z" };
function archive(day: number): V2HistoricalCycleArchive {
  const runId = "batch_00" + day;
  const researchAsOf = "2026-08-0" + day + "T12:00:00Z";
  const capturedAt = "2026-08-0" + (day + 1) + "T12:00:00Z";
  const cycle = {
    pipelineVersion: "ag-opportunity-v2" as const, runId, capacity: 1,
    capturedAt, researchAsOf, v1SelectedSymbols: ["AAA"],
    candidates: [{ symbol: "AAA", origin: "NEW_DISCOVERY" as const,
      assessments: [{ version: "ag-opportunity-v2" as const,
        path: "CATALYST" as const, status: "QUALIFIED" as const,
        evidenceCoverage: 90, evidenceStrength: null, supportingFacts: [],
        contradictingFacts: [], missingCriticalEvidence: [],
        economicMechanism: "fixture", invalidationConditions: [] }] }],
  };
  const records = [
    { id: "v1", kind: "V1_CYCLE" as const,
      value: { runId, capacity: 1, researchAsOf, selectedSymbols: ["AAA"] } },
    { id: "universe", kind: "UNIVERSE" as const,
      value: { runId, researchAsOf, symbols: ["AAA"] } },
    { id: "identity", kind: "ISSUER_MAPPING" as const,
      value: { runId, researchAsOf, identities: [identity] } },
  ];
  const payloads = records.map(r => ({ id: r.id, utf8: JSON.stringify(r.value) }));
  const sources: V2ArchivedSource[] = records.map((r, i) => ({
    id: r.id, kind: r.kind, sha256: hash(payloads[i].utf8),
    publishedAt: "2026-08-01T00:00:00Z",
    retrievedAt: "2026-08-01T01:00:00Z",
    sourceUrl: "https://example.org/" + runId + "/" + r.id,
  }));
  const manifestUtf8 = JSON.stringify({
    schemaVersion: "ag-history-source-manifest-v1",
    researchAsOf, sources,
  });
  return { manifestUtf8, payloads, envelope: {
    schemaVersion: "ag-history-capture-v1", sourceRevision: "a".repeat(40),
    capturedBy: "operator-1", reviewedBy: "reviewer-2",
    sourceManifestSha256: hash(manifestUtf8),
    history: { pipelineVersion: "ag-opportunity-v2", cycles: [cycle],
      issuerIdentitiesByCycle: [[identity]] },
  } };
}
const first = archive(2);
const second = archive(3);
const good = verifyV2HistoricalArchiveBatch([first, second]);
assert.equal(good.accepted, true);
if (good.accepted) {
  assert.equal(good.cycleCount, 2);
  assert.equal(good.uniqueV1Issuers, 1);
  assert.equal(good.uniqueV2Issuers, 1);
  assert.equal(good.totalV2Slots, 2);
  assert.equal(good.totalV2NewDiscoverySlots, 2);
  assert.deepEqual(good.v2PathUniqueIssuerCounts, { CATALYST: 1 });
}
function rejects(batch: V2HistoricalCycleArchive[], issue: string) {
  const result = verifyV2HistoricalArchiveBatch(batch);
  assert.equal(result.accepted, false);
  if (!result.accepted)
    assert.ok(result.issues.some(x => x.includes(issue)), issue + ":" + result.issues);
}
rejects([], "BATCH_INVALID_COUNT");
rejects([first, first], "DUPLICATE_RUN_ID");
rejects([second, first], "NONMONOTONIC_ASOF");
rejects([first, { ...second, manifestUtf8: second.manifestUtf8 + " " }],
  "MANIFEST_DIGEST_MISMATCH");
rejects([first, { ...second, envelope: {
  ...second.envelope, sourceManifestSha256: first.envelope.sourceManifestSha256,
} }], "REUSED_SOURCE_MANIFEST");
rejects([first, { ...second, envelope: { ...second.envelope,
  history: { ...second.envelope.history, cycles: first.envelope.history.cycles },
} }], "LINKAGE_V1_MISMATCH");
