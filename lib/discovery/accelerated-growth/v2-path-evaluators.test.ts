import { strict as assert } from "node:assert";
import { normalizeAgQuarterlyEvidence } from "./v2-financial-evidence";
import { assessV2Turnaround, assessV2ValuationDislocation } from "./v2-path-evaluators";

const quarters = [
  { fiscalYear: "2026", period: "Q2", revenue: 92, operatingIncome: -2 },
  { fiscalYear: "2026", period: "Q1", revenue: 100, operatingIncome: -9 },
];
const cash = [
  { fiscalYear: "2026", period: "Q2", freeCashFlow: -1 },
  { fiscalYear: "2026", period: "Q1", freeCashFlow: -8 },
];
const recovery = assessV2Turnaround(normalizeAgQuarterlyEvidence(quarters, cash),
  { cashAndEquivalents: 100, totalDebt: 20 });
assert.equal(recovery.status, "QUALIFIED", "Revenue can decline while operating and FCF margins recover");

const missingFcf = assessV2Turnaround(normalizeAgQuarterlyEvidence(quarters, [cash[1]]),
  { cashAndEquivalents: 100, totalDebt: 20 });
assert.equal(missingFcf.status, "INSUFFICIENT_DATA");
assert.equal(missingFcf.evidenceStrength, null);

const deteriorating = assessV2Turnaround(normalizeAgQuarterlyEvidence(
  [
    { fiscalYear: "2026", period: "Q2", revenue: 100, operatingIncome: -12 },
    { fiscalYear: "2026", period: "Q1", revenue: 100, operatingIncome: -5 },
  ],
  [
    { fiscalYear: "2026", period: "Q2", freeCashFlow: -15 },
    { fiscalYear: "2026", period: "Q1", freeCashFlow: -3 },
  ],
), { cashAndEquivalents: 100, totalDebt: 20 });
assert.equal(deteriorating.status, "NOT_QUALIFIED");

const valuationBase = {
  cashAndEquivalents: 100,
  totalDebt: 50,
  normalizedAnnualFreeCashFlow: 30,
  marketCap: 100,
  independentlyEstimatedEquityValue: 145,
  durableEconomicsEvidence: true,
  valueRealizationEvidence: true,
  valueRealizationDescription: "Debt reduction and repeatable owner cash flow",
};
assert.equal(assessV2ValuationDislocation(valuationBase).status, "QUALIFIED");
assert.equal(assessV2ValuationDislocation({
  ...valuationBase, normalizedAnnualFreeCashFlow: -10,
}).status, "WATCH", "A headline discount does not override negative FCF");
assert.equal(assessV2ValuationDislocation({
  ...valuationBase, independentlyEstimatedEquityValue: null,
}).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ValuationDislocation({
  ...valuationBase, valueRealizationEvidence: false,
}).status, "INSUFFICIENT_DATA");
assert.equal(assessV2ValuationDislocation({
  ...valuationBase, independentlyEstimatedEquityValue: 90,
}).status, "NOT_QUALIFIED");
