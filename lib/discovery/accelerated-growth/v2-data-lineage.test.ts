import { strict as assert } from "node:assert";
import { verifyV2Observation, type V2VerifiedObservation, type V2LineageExpectation } from "./v2-data-lineage";
const observation: V2VerifiedObservation = {
  metric: "cash", value: 125, unit: "USD_MILLIONS", fiscalPeriod: "2026-Q2",
  issuerId: "CIK-0000000001", documentId: "filing-2026-q2", extractionId: "normalizer-v2-1",
  source: { url: "https://example.org/filing", publisher: "Issuer",
    publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
    fiscalPeriod: "2026-Q2", metric: "cash", kind: "FILING" },
};
const expected: V2LineageExpectation = {
  metric: "cash", fiscalPeriod: "2026-Q2", issuerId: "CIK-0000000001",
  unit: "USD_MILLIONS", allowedKinds: ["FILING"],
};
assert.deepEqual(verifyV2Observation(observation, expected), []);
assert.ok(verifyV2Observation({ ...observation, unit: "USD" }, expected).includes("LINEAGE_UNIT_MISMATCH"));
assert.ok(verifyV2Observation({ ...observation, issuerId: "OTHER" }, expected).includes("LINEAGE_ISSUER_MISMATCH"));
assert.ok(verifyV2Observation({ ...observation, fiscalPeriod: "2026-Q1" }, expected).includes("LINEAGE_PERIOD_MISMATCH"));
assert.ok(verifyV2Observation({ ...observation, documentId: "" }, expected).includes("LINEAGE_MISSING_DOCUMENT_OR_EXTRACTION"));
assert.ok(verifyV2Observation({ ...observation, value: Number.NaN }, expected).includes("LINEAGE_INVALID_VALUE"));
assert.ok(verifyV2Observation({ ...observation, source: { ...observation.source, kind: "MARKET_DATA" } }, expected).includes("LINEAGE_SOURCE_KIND_DISALLOWED"));
