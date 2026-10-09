import { strict as assert } from "node:assert";
import { buildV2HistoricalPilotReport } from "./v2-history-pilot-report";
import { evaluateV2HistoricalPilotBundle } from "./v2-history-pilot-bundle";
import { inspectV2PilotEvidenceReadiness } from "./v2-pilot-evidence-readiness";
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
    { id: "assessments", kind: "V2_ASSESSMENTS" as const,
      value: { runId, researchAsOf, candidates: cycle.candidates } },
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
  assert.deepEqual(pilot.v2PathIncrementalIssuerCounts, { CATALYST: 0 });
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
    if (p.id === "assessments") return {
      ...p, utf8: JSON.stringify({
        runId: cycle.runId, researchAsOf: cycle.researchAsOf,
        candidates,
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
  assert.deepEqual(novelPilot.v2PathIncrementalIssuerCounts, { CATALYST: 1 });
  assert.equal(novelPilot.uniqueDisplacedIssuers, 0);
  assert.equal(novelPilot.cyclesWithIncrementalIssuers, 1);
  assert.deepEqual(novelPilot.cycles[1].incrementalIssuerIds, ["CIK-456"]);
  assert.deepEqual(novelPilot.v2PathUniqueIssuerCounts, { CATALYST: 2 });
}

const bundleBytes = JSON.stringify({
  schemaVersion: "ag-history-pilot-bundle-v1",
  archives: [first, addNovelIssuer(second)],
});
const bundle = evaluateV2HistoricalPilotBundle(bundleBytes);
assert.equal(bundle.accepted, true);
if (bundle.accepted) {
  assert.equal(bundle.bundleSha256, hash(bundleBytes));
  assert.equal(bundle.report.uniqueIncrementalIssuers, 1);
  assert.deepEqual(bundle.report.v2PathIncrementalIssuerCounts, { CATALYST: 1 });
  assert.equal(bundle.report.cycleCount, 2);
}
assert.deepEqual(evaluateV2HistoricalPilotBundle("not json"), {
  accepted: false, issues: ["PILOT_BUNDLE_INVALID_JSON"],
});
assert.deepEqual(evaluateV2HistoricalPilotBundle(JSON.stringify({
  schemaVersion: "ag-history-pilot-bundle-v1", archives: [],
})), { accepted: false, issues: ["PILOT_BUNDLE_INVALID_SCHEMA"] });
assert.deepEqual(evaluateV2HistoricalPilotBundle(JSON.stringify({
  schemaVersion: "ag-history-pilot-bundle-v1",
  archives: [{ envelope: {}, manifestUtf8: "{}", payloads: [] }],
})), { accepted: false, issues: ["PILOT_BUNDLE_INVALID_ARCHIVE:0"] });
assert.equal(evaluateV2HistoricalPilotBundle(JSON.stringify({
  schemaVersion: "ag-history-pilot-bundle-v1",
  archives: [first, { ...second, envelope: {
    ...second.envelope, history: { ...second.envelope.history,
      cycles: [{ ...second.envelope.history.cycles[0], candidates: [null] }],
    },
  } }],
})).accepted, false);
assert.equal(evaluateV2HistoricalPilotBundle(JSON.stringify({
  schemaVersion: "ag-history-pilot-bundle-v1", archives: [first],
  unreviewedMetadata: true,
})).accepted, false);

function addSecondPath(original: V2HistoricalCycleArchive): V2HistoricalCycleArchive {
  const cycle = original.envelope.history.cycles[0];
  const candidates = cycle.candidates.map(c => ({
    ...c, assessments: [...c.assessments, {
      ...c.assessments[0], path: "VALUATION_DISLOCATION" as const,
    }],
  }));
  const payloads = original.payloads.map(p => p.id === "assessments"
    ? { ...p, utf8: JSON.stringify({
      runId: cycle.runId, researchAsOf: cycle.researchAsOf, candidates,
    }) } : p);
  const manifest = JSON.parse(original.manifestUtf8) as {
    schemaVersion: string; researchAsOf: string; sources: V2ArchivedSource[];
  };
  const manifestUtf8 = JSON.stringify({ ...manifest,
    sources: manifest.sources.map(source => ({
      ...source, sha256: hash(payloads.find(p => p.id === source.id)!.utf8),
    })),
  });
  return {
    payloads, manifestUtf8, envelope: {
      ...original.envelope, sourceManifestSha256: hash(manifestUtf8),
      history: { ...original.envelope.history,
        cycles: [{ ...cycle, candidates }],
      },
    },
  };
}
const multiPath = buildV2HistoricalPilotReport([
  first, addSecondPath(addNovelIssuer(second)),
]);
assert.equal(multiPath.accepted, true);
if (multiPath.accepted) {
  assert.equal(multiPath.uniqueIncrementalIssuers, 1);
  assert.deepEqual(multiPath.v2PathIncrementalIssuerCounts, {
    CATALYST: 1, VALUATION_DISLOCATION: 1,
  });
}

const evidenceInventory = inspectV2PilotEvidenceReadiness([first, second]);
assert.equal(evidenceInventory.accepted, true);
if (evidenceInventory.accepted) {
  assert.equal(evidenceInventory.cycleCount, 2);
  assert.equal(evidenceInventory.cyclesWithoutExternalEvidence, 2);
  assert.equal(evidenceInventory.cyclesWithBothExternalKinds, 0);
  assert.equal(evidenceInventory.bothExternalKindsPresentEveryCycle, false);
}
const invalidInventory = inspectV2PilotEvidenceReadiness([second, first]);
assert.equal(invalidInventory.accepted, false);
