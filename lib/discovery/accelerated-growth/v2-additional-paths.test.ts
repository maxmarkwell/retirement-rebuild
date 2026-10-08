import { strict as assert } from "node:assert";
import { assessV2AcceleratingFundamentals, assessV2EmergingOpportunity, assessV2Catalyst } from "./v2-additional-paths";
import { assessV2ResearchGate } from "./v2-research-gate";
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
assert.equal(assessV2EmergingOpportunity({ ...emerging, priorCommercialRevenue: 0 }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2EmergingOpportunity({ ...emerging, repeatableUnitEconomicsVerified: false }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(e, null, []).eligible, false);

const catalyst = { eventDate: "2026-12-01", assessmentDate: "2026-10-08",
  verifiedEvent: true, documentedEconomicImpact: true, independentlyCorroborated: true,
  companyCanFundExecution: true, invalidationTriggerDocumented: true };
const c = assessV2Catalyst(catalyst);
assert.equal(c.status, "QUALIFIED");
assert.equal(assessV2Catalyst({ ...catalyst, eventDate: "2026-09-01" }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2Catalyst({ ...catalyst, independentlyCorroborated: false }).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ResearchGate(c, null, []).eligible, false);
