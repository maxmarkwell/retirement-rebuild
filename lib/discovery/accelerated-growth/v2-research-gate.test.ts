import { strict as assert } from "node:assert";
import { assessV2ResearchGate } from "./v2-research-gate";
import type { V2EvidenceRecord } from "./v2-evidence-audit";
import type { V2PathAssessment } from "./v2-path-evaluators";
import type { SurvivalAssessment } from "./v2-financial-survival";

const opportunity: V2PathAssessment = {
  version: "ag-opportunity-v2", path: "TURNAROUND", status: "QUALIFIED",
  evidenceStrength: null, evidenceCoverage: 100, supportingFacts: ["Margins recovering"],
  contradictingFacts: [], missingCriticalEvidence: [],
  economicMechanism: "Improved unit economics", invalidationConditions: ["Recovery stalls"],
};
const survival: SurvivalAssessment = {
  version: "ag-survival-v2", status: "SUPPORTED", runwayQuarters: 8,
  availableLiquidity: 100, debtDueWithin12Months: 10, issues: [],
};
const singleSource = [{
  name: "operatingMargin",
  evidence: {
    value: 5,
    source: {
      url: "https://example.org/report",
      publisher: "Example issuer",
      publishedAt: "2026-06-30",
      retrievedAt: "2026-07-01",
      fiscalPeriod: "2026-Q2",
      metric: "operatingMargin",
      kind: "FILING" as const,
    },
    calculationMethod: "Operating income divided by revenue",
  },
  allowed: ["FILING" as const],
  expectedPeriod: "2026-Q2",
}];
const sources = [
  ...singleSource,
  ...["freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"].map((name, index) => ({
    ...singleSource[0], name,
    evidence: { ...singleSource[0].evidence, value: index + 10, calculationMethod: "Fixture calculation for " + name,
      source: { ...singleSource[0].evidence.source, metric: name } },
  })),
];
const requirements = sources.map(x => ({
  metric: x.name, expectedPeriod: x.expectedPeriod, allowedKinds: x.allowed,
  expectedValue: x.evidence.value, absoluteTolerance: 0,
}));
const assess = (o: V2PathAssessment, v: SurvivalAssessment | null, entries: readonly V2EvidenceRecord[], req = requirements) =>
  assessV2ResearchGate(o, v, entries, req);
assert.equal(assess(opportunity, survival, singleSource).status, "INSUFFICIENT_DATA");
assert.equal(assess(opportunity, survival, sources).status, "ELIGIBLE");
assert.equal(assess(opportunity, { ...survival, status: "AT_RISK" }, sources).status, "RISK_REVIEW");
assert.equal(assess(opportunity, { ...survival, status: "UNVERIFIED" }, sources).status, "INSUFFICIENT_DATA");
assert.equal(assess(opportunity, survival, []).status, "INSUFFICIENT_DATA");
assert.equal(assess({ ...opportunity, status: "NOT_QUALIFIED" }, survival, sources).status, "NOT_QUALIFIED");
assert.equal(assess(opportunity, survival, [{
  ...sources[0], evidence: { ...sources[0].evidence, source: null },
}]).status, "INSUFFICIENT_DATA");

assert.equal(assess(opportunity, survival, [
  singleSource[0],
  ...["freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"].map(name => ({
    ...singleSource[0], name,
  })),
]).status, "INSUFFICIENT_DATA", "Duplicated source evidence cannot stand in for different metrics");

assert.equal(assess(opportunity, survival, [
  ...sources.slice(0, 1),
  { ...sources[1], evidence: { ...sources[1].evidence, source: { ...sources[1].evidence.source, metric: "cash" } } },
  ...sources.slice(2),
]).status, "INSUFFICIENT_DATA", "Mislabeled source metrics cannot satisfy eligibility");

assert.equal(assess(opportunity, survival, [
  ...sources.slice(0, 1),
  { ...sources[1], evidence: { ...sources[1].evidence,
    source: { ...sources[1].evidence.source, fiscalPeriod: "2026-Q1" } } },
  ...sources.slice(2),
]).status, "INSUFFICIENT_DATA", "Prior-quarter evidence cannot masquerade as current-quarter evidence");
assert.equal(assess(opportunity, survival, [
  ...sources.slice(0, 1),
  { ...sources[1], expectedPeriod: "" },
  ...sources.slice(2),
]).status, "INSUFFICIENT_DATA", "Missing expected period must fail closed");

assert.equal(assess(opportunity, survival, sources, []).status, "INSUFFICIENT_DATA",
  "No independent requirements must fail closed");
assert.equal(assess(opportunity, survival, sources, requirements.map(x =>
  x.metric === "cash" ? { ...x, expectedValue: 999 } : x
)).status, "INSUFFICIENT_DATA", "A mismatched independently expected value must fail closed");
assert.equal(assess(opportunity, survival, sources, requirements.map(x =>
  x.metric === "cash" ? { ...x, expectedPeriod: "2026-Q1" } : x
)).status, "INSUFFICIENT_DATA", "A mismatched independently expected period must fail closed");

assert.equal(assess(opportunity, survival, sources, [
  ...requirements,
  { metric: "unknownMetric", expectedPeriod: "2026-Q2", allowedKinds: ["FILING" as const], expectedValue: 1, absoluteTolerance: 0 },
]).status, "INSUFFICIENT_DATA", "Unknown independent audit requirements must fail closed");

assert.equal(assess(opportunity, survival, [
  ...sources,
  { ...sources[0], name: "unapprovedMetric",
    evidence: { ...sources[0].evidence, source: { ...sources[0].evidence.source, metric: "unapprovedMetric" } } },
]).status, "INSUFFICIENT_DATA", "Unknown extra metric must not bypass path source policy");
assert.equal(assess(opportunity, survival, [
  { ...sources[0], allowed: ["MARKET_DATA" as const] }, ...sources.slice(1),
]).status, "INSUFFICIENT_DATA", "Caller cannot relax required filing provenance");
