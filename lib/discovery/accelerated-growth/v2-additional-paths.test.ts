import { strict as assert } from "node:assert";
import { assessV2AcceleratingFundamentals, assessV2EmergingOpportunity, assessV2Catalyst } from "./v2-additional-paths";
import { assessV2ResearchGate } from "./v2-research-gate";
import { V2_PATH_SOURCE_POLICY } from "./v2-path-source-policy";
const acceleration = { latestRevenueGrowthPct: 24, priorRevenueGrowthPct: 15,
  latestOperatingMarginPct: 12, priorOperatingMarginPct: 11, latestFreeCashFlow: 5,
  consecutiveFiscalPeriodsVerified: true };
const a = assessV2AcceleratingFundamentals(acceleration);
assert.equal(a.status, "QUALIFIED");
assert.equal(a.evidenceStrength, null);
assert.equal(assessV2AcceleratingFundamentals({ ...acceleration, consecutiveFiscalPeriodsVerified: false }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2AcceleratingFundamentals({ ...acceleration, latestFreeCashFlow: -1 }).status, "WATCH");
assert.equal(assessV2ResearchGate(a, null, []).eligible, false, "Unimplemented source policy cannot grant eligibility");

const emerging = { commercialRevenue: 150, priorCommercialRevenue: 100,
  customerCount: 140, priorCustomerCount: 100, productInMarketVerified: true,
  repeatableUnitEconomicsVerified: true, consecutiveFiscalPeriodsVerified: true };
const e = assessV2EmergingOpportunity(emerging);
assert.equal(e.status, "QUALIFIED");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCommercialRevenue: 0 }).status, "WATCH");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCustomerCount: 0 }).status, "WATCH");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCommercialRevenue: 0, commercialRevenue: 0 }).status, "NOT_QUALIFIED");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCommercialRevenue: null }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCustomerCount: null }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCustomerCount: 0, customerCount: 0 }).status, "NOT_QUALIFIED");
assert.equal(assessV2EmergingOpportunity({ ...emerging, repeatableUnitEconomicsVerified: false }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(e, null, []).eligible, false);

const catalyst = { eventDate: "2026-12-01", assessmentDate: "2026-10-08",
  verifiedEvent: true, documentedEconomicImpact: true, independentlyCorroborated: true,
  companyCanFundExecution: true, invalidationTriggerDocumented: true };
const c = assessV2Catalyst(catalyst);
assert.equal(c.status, "QUALIFIED");
assert.equal(assessV2Catalyst({ ...catalyst, eventDate: "2026-09-01" }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2Catalyst({ ...catalyst, independentlyCorroborated: false }).status, "INSUFFICIENT_DATA");
for (const eventDate of ["2026-02-30", "2026-13-01", "2026-12-01T00:00:00Z", "2026-10-08"]) {
  assert.equal(assessV2Catalyst({ ...catalyst, eventDate }).status, "INSUFFICIENT_DATA");
}
assert.equal(assessV2Catalyst({ ...catalyst, assessmentDate: "2026-02-30" }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(c, null, []).eligible, false);

const survival = { version: "ag-survival-v2" as const, status: "SUPPORTED" as const,
  runwayQuarters: 8, availableLiquidity: 100, debtDueWithin12Months: 10, issues: [] };
for (const assessment of [a, e, c]) {
  const policy = V2_PATH_SOURCE_POLICY[assessment.path];
  const records = Object.entries(policy).map(([name, allowed], index) => ({
    name, allowed, expectedPeriod: "2026-Q2",
    evidence: { value: index + 1, calculationMethod: "Independently normalized fixture " + name,
      source: { url: "https://example.org/" + name, publisher: "Fixture issuer",
        publishedAt: "2026-07-01", retrievedAt: "2026-07-02",
        fiscalPeriod: "2026-Q2", metric: name, kind: allowed[0] } },
  }));
  const requirements = records.map(record => ({
    metric: record.name, expectedPeriod: record.expectedPeriod,
    allowedKinds: record.allowed, expectedValue: record.evidence.value, absoluteTolerance: 0,
  }));
  assert.equal(assessV2ResearchGate(assessment, survival, records, requirements).status, "ELIGIBLE",
    assessment.path + " has a complete source policy");
  assert.equal(assessV2ResearchGate(assessment, survival, records.slice(1), requirements).status, "INSUFFICIENT_DATA",
    assessment.path + " cannot omit a required metric");
  assert.equal(assessV2ResearchGate(assessment, survival, records, requirements.map((x, i) =>
    i === 0 ? { ...x, expectedValue: -999 } : x)).status, "INSUFFICIENT_DATA",
    assessment.path + " cannot accept an uncorroborated value");
  assert.equal(assessV2ResearchGate(assessment, survival, records, requirements.map((x, i) =>
    i === 0 ? { ...x, allowedKinds: ["MARKET_DATA" as const] } : x)).status, "INSUFFICIENT_DATA",
    assessment.path + " cannot override provenance policy");
}
