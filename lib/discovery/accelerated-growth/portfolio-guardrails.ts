export const AG_PORTFOLIO_GUARDRAILS_VERSION = "ag-guardrails-v1";

export type AgPortfolioGuardrailInput = {
  referenceTotalCapital: number;
  currentAgMarketValue: number;
  currentThemeMarketValue: number;
  currentPositionMarketValue: number;
  availableCash: number;
  sleeveDrawdownPct: number;
  thesisValid: boolean;
  liquidityEligible: boolean;
  reassessmentComplete?: boolean;
};

export type AgPortfolioGuardrailResult = {
  buyAllowed: boolean;
  addAllowed: boolean;
  circuitBreakerActive: boolean;
  limits: {
    sleeveCap: number;
    positionCap: number;
    themeCap: number;
    drawdownReviewThresholdPct: number;
  };
  reasons: string[];
  version: string;
};

const money = (n: number) => Math.floor(Math.max(0, n) * 100) / 100;

export function evaluateAgPortfolioGuardrails(input: AgPortfolioGuardrailInput): AgPortfolioGuardrailResult {
  const sleeveCap = money(input.referenceTotalCapital * 0.20);
  const positionCap = money(input.referenceTotalCapital * 0.05);
  const themeCap = money(input.referenceTotalCapital * 0.10);
  // v1 circuit breaker pauses new risk at a 20% AG-sleeve drawdown.
  // It does not force a sale; it requires reassessment before additional capital.
  const drawdownReviewThresholdPct = 20;
  const circuitBreakerActive = input.sleeveDrawdownPct >= drawdownReviewThresholdPct;
  const reasons: string[] = [];

  if (input.currentAgMarketValue >= sleeveCap) reasons.push("AG sleeve is at or above its capital ceiling.");
  if (input.currentThemeMarketValue >= themeCap) reasons.push("AG theme exposure is at or above its concentration ceiling.");
  if (input.currentPositionMarketValue >= positionCap) reasons.push("AG position is at or above its position ceiling.");
  if (input.availableCash < 5) reasons.push("Available cash is below the minimum executable BUY notional.");
  if (!input.thesisValid) reasons.push("The AG thesis is invalid or requires re-underwriting.");
  if (!input.liquidityEligible) reasons.push("The security no longer passes the AG liquidity gate.");
  if (circuitBreakerActive) reasons.push("AG sleeve drawdown circuit breaker is active; new risk is paused pending reassessment.");

  const buyAllowed = reasons.length === 0;
  const addAllowed = buyAllowed && input.reassessmentComplete === true;

  return {
    buyAllowed,
    addAllowed,
    circuitBreakerActive,
    limits: { sleeveCap, positionCap, themeCap, drawdownReviewThresholdPct },
    reasons,
    version: AG_PORTFOLIO_GUARDRAILS_VERSION,
  };
}
