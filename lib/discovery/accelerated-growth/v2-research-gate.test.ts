import { strict as assert } from "node:assert";
import { assessV2ResearchGate } from "./v2-research-gate";
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
      kind: "FILING" as const,
    },
    calculationMethod: "Operating income divided by revenue",
  },
  allowed: ["FILING" as const],
}];
const sources = [
  ...singleSource,
  ...["freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"].map((name, index) => ({
    ...singleSource[0], name,
    evidence: { ...singleSource[0].evidence, value: index + 10, calculationMethod: "Fixture calculation for " + name },
  })),
];
assert.equal(assessV2ResearchGate(opportunity, survival, singleSource).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(opportunity, survival, sources).status, "ELIGIBLE");
assert.equal(assessV2ResearchGate(opportunity, { ...survival, status: "AT_RISK" }, sources).status, "RISK_REVIEW");
assert.equal(assessV2ResearchGate(opportunity, { ...survival, status: "UNVERIFIED" }, sources).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(opportunity, survival, []).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate({ ...opportunity, status: "NOT_QUALIFIED" }, survival, sources).status, "NOT_QUALIFIED");
assert.equal(assessV2ResearchGate(opportunity, survival, [{
  ...sources[0], evidence: { ...sources[0].evidence, source: null },
}]).status, "INSUFFICIENT_DATA");

assert.equal(assessV2ResearchGate(opportunity, survival, [
  singleSource[0],
  ...["freeCashFlow", "cash", "debt", "debtMaturities", "creditAvailability"].map(name => ({
    ...singleSource[0], name,
  })),
]).status, "INSUFFICIENT_DATA", "Duplicated source evidence cannot stand in for different metrics");
