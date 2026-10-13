import { strict as assert } from "node:assert";
import { adjacentQuarterChange, normalizeAgQuarterlyEvidence } from "./v2-financial-evidence";

/**
 * Pure fixture checks. Run with a TypeScript-capable test runner or
 * Node supporting type stripping; this file does not call production services.
 */
const income = [
  { fiscalYear: "2026", period: "Q2", revenue: 100, operatingIncome: -5 },
  { fiscalYear: "2026", period: "Q1", revenue: 100, operatingIncome: -12 },
  { fiscalYear: "2025", period: "Q4", revenue: 100, operatingIncome: -20 },
];
const cash = [
  { fiscalYear: "2026", period: "Q1", freeCashFlow: -15 },
  { fiscalYear: "2025", period: "Q4", freeCashFlow: -30 },
];
const evidence = normalizeAgQuarterlyEvidence(income, cash);
assert.equal(evidence.quarters[0].key, "2026-Q2");
assert.equal(evidence.quarters[0].cashFlowMatched, false);
assert.equal(evidence.quarters[0].freeCashFlow, null);
assert.equal(adjacentQuarterChange(evidence, "operatingMarginPct").change, 7);
assert.equal(adjacentQuarterChange(evidence, "freeCashFlowMarginPct").change, null);

const gap = normalizeAgQuarterlyEvidence(
  [income[0], income[2]],
  [cash[1]],
);
assert.equal(adjacentQuarterChange(gap, "operatingMarginPct").change, null);
assert.equal(adjacentQuarterChange(gap, "operatingMarginPct").reason, "NONCONSECUTIVE_PERIODS");

const ambiguous = normalizeAgQuarterlyEvidence(
  [income[1]],
  [cash[0], { ...cash[0], freeCashFlow: 999 }],
);
assert.equal(ambiguous.quarters[0].freeCashFlow, null);
assert.ok(ambiguous.quarters[0].flags.includes("AMBIGUOUS_CASH_FLOW"));

const unverifiedCapex = normalizeAgQuarterlyEvidence(
  [income[1]],
  [{ fiscalYear: "2026", period: "Q1", operatingCashFlow: 20, capitalExpenditure: 5 }],
);
assert.equal(unverifiedCapex.quarters[0].freeCashFlow, null);
assert.ok(unverifiedCapex.quarters[0].flags.includes("CAPEX_SIGN_UNVERIFIED"));

const missingKey = normalizeAgQuarterlyEvidence(
  [{ date: "2026-06-30", revenue: 100 }],
  [{ date: "2026-06-30", freeCashFlow: 20 }],
);
assert.equal(missingKey.quarters.length, 0);
assert.ok(missingKey.issues.includes("INCOME_MISSING_FISCAL_KEY"));
