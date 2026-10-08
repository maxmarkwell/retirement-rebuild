import { adjacentQuarterChange, type V2QuarterlyEvidence } from "./v2-financial-evidence";

/**
 * Deterministic v2 research qualification, not investment approval or sizing.
 * Thresholds are provisional screening heuristics, not calibrated BUY rules.
 */
export type V2Path = "TURNAROUND" | "VALUATION_DISLOCATION";
export type V2PathStatus = "QUALIFIED" | "WATCH" | "NOT_QUALIFIED" | "INSUFFICIENT_DATA";
export type V2PathAssessment = {
  version: "ag-opportunity-v2";
  path: V2Path;
  status: V2PathStatus;
  evidenceStrength: number | null;
  evidenceCoverage: number;
  supportingFacts: string[];
  contradictingFacts: string[];
  missingCriticalEvidence: string[];
  economicMechanism: string;
  invalidationConditions: string[];
};

export type V2BalanceSheet = {
  cashAndEquivalents: number | null;
  totalDebt: number | null;
  /** Annual or TTM FCF must be period-labeled by the caller. */
  normalizedAnnualFreeCashFlow: number | null;
  marketCap: number | null;
  /** Independently supported estimate, NOT generated from the current price. */
  independentlyEstimatedEquityValue: number | null;
  valueRealizationEvidence: boolean;
  valueRealizationDescription: string | null;
  /** Explicit assessment of whether business economics are stable enough to value. */
  durableEconomicsEvidence: boolean;
};

function finite(value: number | null): value is number {
  return value != null && Number.isFinite(value);
}
function coverage(present: boolean[]): number {
  return Math.round(100 * present.filter(Boolean).length / present.length);
}
function assessment(
  path: V2Path, status: V2PathStatus, evidenceCoverage: number,
  supportingFacts: string[], contradictingFacts: string[], missingCriticalEvidence: string[],
  economicMechanism: string, invalidationConditions: string[],
): V2PathAssessment {
  return {
    version: "ag-opportunity-v2", path, status,
    evidenceStrength: status === "INSUFFICIENT_DATA" ? null :
      Math.max(0, Math.min(100, Math.round(50 + supportingFacts.length * 12 - contradictingFacts.length * 20))),
    evidenceCoverage, supportingFacts, contradictingFacts,
    missingCriticalEvidence, economicMechanism, invalidationConditions,
  };
}

/**
 * A recovery can qualify despite declining revenue. Requires an observable
 * operating improvement and either an improving cash margin or a clear cash
 * survival runway. This is a screen for adversarial research, never a BUY.
 */
export function assessV2Turnaround(
  quarterly: V2QuarterlyEvidence,
  balance: Pick<V2BalanceSheet, "cashAndEquivalents" | "totalDebt">,
): V2PathAssessment {
  const op = adjacentQuarterChange(quarterly, "operatingMarginPct");
  const fcf = adjacentQuarterChange(quarterly, "freeCashFlowMarginPct");
  const latest = quarterly.quarters[0];
  const missing: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  const hasBalance = finite(balance.cashAndEquivalents) && finite(balance.totalDebt);
  if (op.change == null) missing.push("Two consecutive, period-aligned operating-margin observations");
  if (fcf.change == null) missing.push("Two consecutive, period-aligned FCF-margin observations");
  if (!hasBalance) missing.push("Current cash and debt balances");
  const opImproving = op.change != null && op.change >= 2;
  const cashImproving = fcf.change != null && fcf.change >= 2;
  const cashNotDeteriorating = fcf.change != null && fcf.change >= -1;
  if (opImproving) positive.push("Operating margin improved by at least 2 percentage points quarter over quarter");
  if (cashImproving) positive.push("FCF margin improved by at least 2 percentage points quarter over quarter");
  if (op.change != null && op.change <= -2) negative.push("Operating margin deteriorated materially");
  if (fcf.change != null && fcf.change <= -2) negative.push("FCF margin deteriorated materially");
  if (hasBalance && balance.cashAndEquivalents! < balance.totalDebt! && latest?.freeCashFlow != null && latest.freeCashFlow < 0) {
    negative.push("Debt exceeds cash while latest quarterly FCF is negative; liquidity needs deeper verification");
  }
  const evidenceCoverage = coverage([op.change != null, fcf.change != null, hasBalance]);
  const status: V2PathStatus =
    op.change == null || fcf.change == null || !hasBalance ? "INSUFFICIENT_DATA" :
    opImproving && cashImproving && negative.length === 0 ? "QUALIFIED" :
    (opImproving || cashImproving) && cashNotDeteriorating ? "WATCH" :
    opImproving || cashImproving ? "WATCH" : "NOT_QUALIFIED";
  return assessment("TURNAROUND", status, evidenceCoverage, positive, negative, missing,
    "Operating recovery must translate into sustainable cash generation without unacceptable financing risk.",
    ["Operating margin recovery reverses", "Cash burn accelerates", "Liquidity or refinancing conditions deteriorate"]);
}

/**
 * A low multiple alone cannot qualify. A valuation path needs independently
 * estimated equity value, durable economics, and an evidenced realization
 * mechanism. Negative FCF is not silently converted into a neutral multiple.
 */
export function assessV2ValuationDislocation(input: V2BalanceSheet): V2PathAssessment {
  const positive: string[] = [];
  const negative: string[] = [];
  const missing: string[] = [];
  const hasMarketCap = finite(input.marketCap) && input.marketCap > 0;
  const hasFairValue = finite(input.independentlyEstimatedEquityValue) && input.independentlyEstimatedEquityValue > 0;
  const hasFcf = finite(input.normalizedAnnualFreeCashFlow);
  const hasBalance = finite(input.cashAndEquivalents) && finite(input.totalDebt);
  const hasMechanism = input.valueRealizationEvidence && Boolean(input.valueRealizationDescription?.trim());
  const checks = [hasMarketCap, hasFairValue, hasFcf, hasBalance, input.durableEconomicsEvidence, hasMechanism];
  if (!hasMarketCap) missing.push("Current market capitalization");
  if (!hasFairValue) missing.push("Independent, documented equity-value estimate");
  if (!hasFcf) missing.push("Period-consistent normalized annual FCF");
  if (!hasBalance) missing.push("Cash and debt balances");
  if (!input.durableEconomicsEvidence) missing.push("Evidence of durable underlying economics");
  if (!hasMechanism) missing.push("Evidence-backed value realization mechanism");
  if (hasFcf && input.normalizedAnnualFreeCashFlow! <= 0) negative.push("Normalized FCF is nonpositive");
  if (hasBalance && input.totalDebt! > input.cashAndEquivalents! * 3) negative.push("Debt materially exceeds cash; financing risk needs verification");
  const upsidePct = hasMarketCap && hasFairValue
    ? (input.independentlyEstimatedEquityValue! / input.marketCap! - 1) * 100 : null;
  if (upsidePct != null && upsidePct >= 30) positive.push("Independent equity-value estimate exceeds market cap by at least 30%");
  if (upsidePct != null && upsidePct <= 0) negative.push("No indicated discount to independently estimated equity value");
  if (hasFcf && input.normalizedAnnualFreeCashFlow! > 0) positive.push("Normalized FCF is positive");
  if (input.durableEconomicsEvidence) positive.push("Durable economics supported");
  if (hasMechanism) positive.push("Value realization mechanism documented: " + input.valueRealizationDescription!.trim());
  const status: V2PathStatus =
    checks.some(x => !x) ? "INSUFFICIENT_DATA" :
    upsidePct! >= 30 && negative.length === 0 ? "QUALIFIED" :
    upsidePct! > 0 ? "WATCH" : "NOT_QUALIFIED";
  return assessment("VALUATION_DISLOCATION", status, coverage(checks), positive, negative, missing,
    "A defensible discount can close through sustainable cash generation and a documented value-realization path.",
    ["Normalized cash generation weakens", "Independent valuation estimate is invalidated", "Realization mechanism fails"]);
}
