import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { verifyV2ArchivedSources, type V2ArchivedSource } from "./v2-history-source-archive";
import type { V2HistoryCaptureEnvelope } from "./v2-history-capture";
const hash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const assessment = { version: "ag-opportunity-v2" as const,
  path: "CATALYST" as const, status: "QUALIFIED" as const,
  evidenceCoverage: 90, evidenceStrength: null, supportingFacts: [],
  contradictingFacts: [], missingCriticalEvidence: [],
  economicMechanism: "fixture", invalidationConditions: [] };
const cycle = { pipelineVersion: "ag-opportunity-v2" as const,
  runId: "archive_001", capacity: 1, capturedAt: "2026-08-03T12:00:00Z",
  researchAsOf: "2026-08-02T12:00:00Z", v1SelectedSymbols: ["AAA"],
  candidates: [{ symbol: "AAA", origin: "NEW_DISCOVERY" as const,
    assessments: [assessment] }] };
const payloads = [
  { id: "cycle", utf8: '{"selected":["AAA"]}' },
  { id: "universe", utf8: '{"all":["AAA"]}' },
  { id: "mapping", utf8: '{"AAA":"CIK-123"}' },
];
const kinds: V2ArchivedSource["kind"][] = ["V1_CYCLE", "UNIVERSE", "ISSUER_MAPPING"];
const sources: V2ArchivedSource[] = payloads.map((p, i) => ({
  id: p.id, kind: kinds[i], sha256: hash(p.utf8),
  publishedAt: "2026-08-01T00:00:00Z",
  retrievedAt: "2026-08-02T00:00:00Z",
  sourceUrl: "https://example.org/" + p.id,
}));
const manifest = { schemaVersion: "ag-history-source-manifest-v1" as const,
  researchAsOf: cycle.researchAsOf, sources };
const serialize = (value: unknown) => JSON.stringify(value);
const manifestUtf8 = serialize(manifest);
const envelope: V2HistoryCaptureEnvelope = {
  schemaVersion: "ag-history-capture-v1",
  sourceRevision: "a".repeat(40), capturedBy: "operator-1",
  reviewedBy: "reviewer-2", sourceManifestSha256: hash(manifestUtf8),
  history: { pipelineVersion: "ag-opportunity-v2", cycles: [cycle],
    issuerIdentitiesByCycle: [[{ symbol: "AAA", issuerId: "CIK-123",
      effectiveAt: "2026-07-01T00:00:00Z" }]] },
};
const good = verifyV2ArchivedSources(envelope, manifestUtf8, payloads);
assert.deepEqual(good, { accepted: true, issues: [], verifiedSources: 3 });
function rejects(m: typeof manifest, p: typeof payloads, issue: string) {
  const bytes = serialize(m);
  const result = verifyV2ArchivedSources({
    ...envelope, sourceManifestSha256: hash(bytes),
  }, bytes, p);
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some(x => x.includes(issue)), issue + ":" + result.issues);
}
rejects(manifest, payloads.slice(1), "ARCHIVE_MISSING_PAYLOAD:cycle");
rejects(manifest, [{ ...payloads[0], utf8: "tampered" }, ...payloads.slice(1)],
  "ARCHIVE_HASH_MISMATCH:cycle");
rejects(manifest, [...payloads, { id: "extra", utf8: "x" }],
  "ARCHIVE_UNMATCHED_PAYLOAD:extra");
rejects({ ...manifest, sources: [sources[0], sources[0], ...sources.slice(1)] },
  payloads, "ARCHIVE_INVALID_SOURCE");
rejects({ ...manifest, sources: sources.map((s, i) => i === 0 ?
  { ...s, publishedAt: "2026-08-04T00:00:00Z" } : s) },
  payloads, "ARCHIVE_LOOKAHEAD_OR_INVALID_TIME");
rejects({ ...manifest, sources: sources.map((s, i) => i === 0 ?
  { ...s, sourceUrl: "https://user:password@example.org/" } : s) },
  payloads, "ARCHIVE_INVALID_SOURCE" );
rejects({ ...manifest, researchAsOf: "2026-08-03T12:00:00Z" },
  payloads, "ARCHIVE_ASOF_MISMATCH");
rejects({ ...manifest, sources: sources.slice(0, 2) },
  payloads.slice(0, 2), "ARCHIVE_MISSING_REQUIRED_SOURCE_KIND");
assert.ok(verifyV2ArchivedSources(envelope, manifestUtf8 + " ", payloads)
  .issues.includes("MANIFEST_DIGEST_MISMATCH"));
