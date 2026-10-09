import { strict as assert } from "node:assert";
import { buildV2HistoricalPilotReport } from "./v2-history-pilot-report";
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
  history: { ...second.envelope.history, cycles: [{
    ...second.envelope.history.cycles[0], v1SelectedSymbols: ["BBB"],
  }] },
} }], "SLOT_SHADOW_MISSING_V1_CANDIDATE");

rejects([first, second, first], "BATCH_2:NONMONOTONIC_ASOF");
rejects([first, { ...second, payloads: second.payloads.slice(1) }],
  "ARCHIVE_MISSING_PAYLOAD:v1");

const pilot = buildV2HistoricalPilotReport([first, second]);
assert.equal(pilot.accepted, true);
if (pilot.accepted) {
  assert.equal(pilot.cycleCount, 2);
  assert.equal(pilot.totalV1Slots, 2);
  assert.equal(pilot.totalV2Slots, 2);
  assert.equal(pilot.totalOverlapSlots, 2);
  assert.equal(pilot.totalNewlySelectedSlots, 0);
  assert.equal(pilot.totalDisplacedV1Slots, 0);
  assert.equal(pilot.uniqueIncrementalIssuers, 0);
  assert.equal(pilot.uniqueDisplacedIssuers, 0);
  assert.equal(pilot.cyclesWithIncrementalIssuers, 0);
  assert.deepEqual(pilot.cycles.map(c => c.runId), ["batch_002", "batch_003"]);
}
const failedPilot = buildV2HistoricalPilotReport([second, first]);
assert.equal(failedPilot.accepted, false);
if (!failedPilot.accepted) assert.ok(failedPilot.issues.some(x => x.includes("NONMONOTONIC_ASOF")));

function addNovelIssuer(original: V2HistoricalCycleArchive): V2HistoricalCycleArchive {
  const cycle = original.envelope.history.cycles[0];
  const originalCandidate = cycle.candidates[0];
  const novel = { symbol: "BBB", issuerId: "CIK-456",
    effectiveAt: "2026-07-01T00:00:00Z" };
  const candidates = [originalCandidate, {
    ...originalCandidate, symbol: "BBB",
    assessments: originalCandidate.assessments.map(a => ({
      ...a, evidenceCoverage: 99,
    })),
  }];
  const identities = [...original.envelope.history.issuerIdentitiesByCycle[0], novel];
  const payloads = original.payloads.map(p => {
    if (p.id === "universe") return {
      ...p, utf8: JSON.stringify({
        runId: cycle.runId, researchAsOf: cycle.researchAsOf,
        symbols: ["AAA", "BBB"],
      }),
    };
    if (p.id === "identity") return {
      ...p, utf8: JSON.stringify({
        runId: cycle.runId, researchAsOf: cycle.researchAsOf,
        identities,
      }),
    };
    return p;
  });
  const parsed = JSON.parse(original.manifestUtf8) as {
    schemaVersion: string; researchAsOf: string; sources: V2ArchivedSource[];
  };
  const manifestUtf8 = JSON.stringify({
    ...parsed, sources: parsed.sources.map(source => ({
      ...source, sha256: hash(payloads.find(p => p.id === source.id)!.utf8),
    })),
  });
  return {
    manifestUtf8, payloads,
    envelope: {
      ...original.envelope, sourceManifestSha256: hash(manifestUtf8),
      history: {
        ...original.envelope.history,
        cycles: [{ ...cycle, candidates }],
        issuerIdentitiesByCycle: [identities],
      },
    },
  };
}
const novelPilot = buildV2HistoricalPilotReport([first, addNovelIssuer(second)]);
assert.equal(novelPilot.accepted, true);
if (novelPilot.accepted) {
  assert.equal(novelPilot.totalNewlySelectedSlots, 1);
  assert.equal(novelPilot.totalDisplacedV1Slots, 1);
  assert.equal(novelPilot.uniqueIncrementalIssuers, 1);
  assert.equal(novelPilot.uniqueDisplacedIssuers, 0);
  assert.equal(novelPilot.cyclesWithIncrementalIssuers, 1);
  assert.deepEqual(novelPilot.cycles[1].incrementalIssuerIds, ["CIK-456"]);
  assert.deepEqual(novelPilot.v2PathUniqueIssuerCounts, { CATALYST: 2 });
}
