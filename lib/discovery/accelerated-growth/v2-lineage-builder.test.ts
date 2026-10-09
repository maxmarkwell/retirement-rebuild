import { strict as assert } from "node:assert";
import { buildV2LineageRequirements } from "./v2-lineage-builder";
import { V2_PATH_SOURCE_POLICY } from "./v2-path-source-policy";
import { assessV2ResearchGate } from "./v2-research-gate";
import type { V2PathAssessment } from "./v2-path-evaluators";
import type { V2VerifiedObservation, V2LineageExpectation } from "./v2-data-lineage";
const path = "TURNAROUND" as const;
const policy = V2_PATH_SOURCE_POLICY[path];
const issuerId = "CIK-TEST-1";
const observations: V2VerifiedObservation[] = Object.entries(policy).map(([metric, kinds], i) => ({
  metric, value: i + 10, unit: "USD_MILLIONS", fiscalPeriod: "2026-Q2",
  issuerId, documentId: "filing-q2-" + metric, extractionId: "independent-normalizer-v1",
  source: { url: "https://example.org/filing/" + metric, publisher: "Issuer",
    publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
    fiscalPeriod: "2026-Q2", metric, kind: kinds[0] },
}));
const expectations: V2LineageExpectation[] = observations.map(x => ({
  metric: x.metric, fiscalPeriod: x.fiscalPeriod, issuerId,
  unit: x.unit, allowedKinds: policy[x.metric],
}));
const tolerances = Object.fromEntries(observations.map(x => [x.metric, 0]));
const input = { path, issuerId, observations, expectations, tolerances };
const built = buildV2LineageRequirements(input);
assert.equal(built.ready, true);
assert.equal(built.requirements.length, observations.length);
const records = observations.map(x => ({
  name: x.metric, expectedPeriod: x.fiscalPeriod, allowed: policy[x.metric],
  evidence: { value: x.value, calculationMethod: "Independently computed",
    source: { ...x.source, url: "https://research.example.org/" + x.metric,
      documentId: "research-document-" + x.metric } },
}));
const opportunity: V2PathAssessment = {
  version: "ag-opportunity-v2", path, status: "QUALIFIED",
  evidenceStrength: null, evidenceCoverage: 100, supportingFacts: [],
  contradictingFacts: [], missingCriticalEvidence: [],
  economicMechanism: "Recovery", invalidationConditions: ["Recovery reverses"],
};
const survival = { version: "ag-survival-v2" as const, status: "SUPPORTED" as const,
  runwayQuarters: 6, availableLiquidity: 100, debtDueWithin12Months: 10, issues: [] };
assert.equal(assessV2ResearchGate(opportunity, survival, records, built.requirements,
  { requireLineage: true }).status, "ELIGIBLE");
assert.equal(assessV2ResearchGate(opportunity, survival, [
  { ...records[0], evidence: { ...records[0].evidence, value: 999 } }, ...records.slice(1),
], built.requirements, { requireLineage: true }).status, "INSUFFICIENT_DATA");
assert.equal(buildV2LineageRequirements({ ...input, observations: observations.slice(1) }).ready, false);
assert.equal(buildV2LineageRequirements({ ...input, observations: [...observations, observations[0]] }).ready, false);
assert.equal(buildV2LineageRequirements({ ...input, observations: [
  { ...observations[0], unit: "USD" }, ...observations.slice(1),
] }).ready, false);
assert.equal(buildV2LineageRequirements({ ...input, observations: [
  { ...observations[0], issuerId: "CIK-OTHER" }, ...observations.slice(1),
] }).ready, false);
assert.equal(buildV2LineageRequirements({ ...input, tolerances: {} }).ready, false);
assert.equal(buildV2LineageRequirements({ ...input, expectations: [
  { ...expectations[0], allowedKinds: ["MARKET_DATA"] }, ...expectations.slice(1),
] }).ready, false);

assert.equal(assessV2ResearchGate(opportunity, survival, [
  { ...records[0], evidence: { ...records[0].evidence, source: observations[0].source } },
  ...records.slice(1),
], built.requirements, { requireLineage: true }).status, "INSUFFICIENT_DATA",
  "Strict audit must reject comparison records sourced from the candidate's same URL");

assert.equal(assessV2ResearchGate(opportunity, survival, [
  { ...records[0], evidence: { ...records[0].evidence,
    source: { ...records[0].evidence.source!, documentId: observations[0].documentId } } },
  ...records.slice(1),
], built.requirements, { requireLineage: true }).status, "INSUFFICIENT_DATA",
  "Two different URLs for the same document are not independent");
assert.equal(assessV2ResearchGate(opportunity, survival, [
  { ...records[0], evidence: { ...records[0].evidence,
    source: { ...records[0].evidence.source!, documentId: undefined } } },
  ...records.slice(1),
], built.requirements, { requireLineage: true }).status, "INSUFFICIENT_DATA",
  "Strict mode requires candidate document identity");
