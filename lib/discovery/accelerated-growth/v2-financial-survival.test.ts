import { strict as assert } from "node:assert";
import { assessV2FinancialSurvival } from "./v2-financial-survival";

const base = {
  cashAndEquivalents: 100,
  availableUndrawnCredit: 20,
  quarterlyCashBurn: 10,
  debtDueWithin12Months: 30,
  sameAsOfPeriodVerified: true,
};
const supported = assessV2FinancialSurvival(base);
assert.equal(supported.status, "SUPPORTED");
assert.equal(supported.availableLiquidity, 120);
assert.equal(supported.runwayQuarters, 12);

const stressed = assessV2FinancialSurvival({
  ...base, cashAndEquivalents: 20, availableUndrawnCredit: 0,
});
assert.equal(stressed.status, "AT_RISK");
assert.ok(stressed.issues.includes("LIQUIDITY_BELOW_12_MONTH_CASH_NEED"));

const maturityWall = assessV2FinancialSurvival({
  ...base, quarterlyCashBurn: 0, debtDueWithin12Months: 200,
});
assert.equal(maturityWall.status, "AT_RISK", "Zero burn does not erase debt maturities");

const unknownMaturities = assessV2FinancialSurvival({
  ...base, debtDueWithin12Months: null,
});
assert.equal(unknownMaturities.status, "UNVERIFIED");
assert.equal(unknownMaturities.runwayQuarters, null);

const stale = assessV2FinancialSurvival({
  ...base, sameAsOfPeriodVerified: false,
});
assert.equal(stale.status, "UNVERIFIED");

const unknownCredit = assessV2FinancialSurvival({
  ...base, availableUndrawnCredit: null,
});
assert.equal(unknownCredit.status, "UNVERIFIED");

const negativeCredit = assessV2FinancialSurvival({
  ...base, availableUndrawnCredit: -10,
});
assert.equal(negativeCredit.status, "UNVERIFIED");
