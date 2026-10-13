/**
 * Discovery v2 financial survival gate.
 * A research screening assessment, never a trade or position-sizing instruction.
 * Inputs must be independently sourced and period-consistent.
 */
export type SurvivalStatus = "SUPPORTED" | "AT_RISK" | "UNVERIFIED";
export type SurvivalInput = {
  cashAndEquivalents: number | null;
  availableUndrawnCredit: number | null;
  quarterlyCashBurn: number | null;
  debtDueWithin12Months: number | null;
  /** Caller must verify that cash, facilities, burn, and maturities share a coherent as-of date. */
  sameAsOfPeriodVerified: boolean;
};
export type SurvivalAssessment = {
  version: "ag-survival-v2";
  status: SurvivalStatus;
  runwayQuarters: number | null;
  availableLiquidity: number | null;
  debtDueWithin12Months: number | null;
  issues: string[];
};

const validNonnegative = (n: number | null): n is number =>
  n != null && Number.isFinite(n) && n >= 0;

/**
 * Conservative screen: does not presume refinancing, asset sales, or new equity.
 * Positive operating cash flow does not eliminate debt maturity requirements.
 */
export function assessV2FinancialSurvival(input: SurvivalInput): SurvivalAssessment {
  const issues: string[] = [];
  if (!input.sameAsOfPeriodVerified) issues.push("AS_OF_PERIOD_UNVERIFIED");
  if (!validNonnegative(input.cashAndEquivalents)) issues.push("CASH_UNAVAILABLE");
  if (!validNonnegative(input.availableUndrawnCredit)) issues.push("AVAILABLE_CREDIT_UNVERIFIED");
  if (!validNonnegative(input.quarterlyCashBurn)) issues.push("CASH_BURN_UNAVAILABLE");
  if (!validNonnegative(input.debtDueWithin12Months)) issues.push("DEBT_MATURITIES_UNAVAILABLE");

  const complete = issues.length === 0;
  const liquidity = complete ? input.cashAndEquivalents! + input.availableUndrawnCredit! : null;
  const runwayQuarters = complete
    ? input.quarterlyCashBurn! === 0 ? null : liquidity! / input.quarterlyCashBurn!
    : null;
  if (!complete) return {
    version: "ag-survival-v2", status: "UNVERIFIED", runwayQuarters: null,
    availableLiquidity: null, debtDueWithin12Months: input.debtDueWithin12Months, issues,
  };

  const annualBurn = input.quarterlyCashBurn! * 4;
  const cashNeed = input.debtDueWithin12Months! + annualBurn;
  const atRisk = liquidity! < cashNeed;
  if (atRisk) issues.push("LIQUIDITY_BELOW_12_MONTH_CASH_NEED");
  return {
    version: "ag-survival-v2", status: atRisk ? "AT_RISK" : "SUPPORTED",
    runwayQuarters, availableLiquidity: liquidity,
    debtDueWithin12Months: input.debtDueWithin12Months, issues,
  };
}
