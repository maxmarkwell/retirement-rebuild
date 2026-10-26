import { evaluateAgPortfolioGuardrails } from "./portfolio-guardrails";
import { sizeAgBuy } from "./risk-sizing";

/**
 * Pure, read-only AG sizing preflight.
 * Inputs must be derived by an authenticated, user-scoped caller from authoritative
 * portfolio/era/accounting/quote evidence. It never loads or mutates records.
 *
 * In particular, an unpersisted Committee research preview is NOT executable evidence.
 */
export type AgBuySizingPreflightInput = {
  portfolioType: string;
  isRealMoney: boolean;
  strategyKey: string;
  executionMode: string;
  eraOpen: boolean;
  decisionType: string;
  decisionSource: string;
  decisionStatus: string;
  decisionAlreadyExecuted: boolean;
  decisionWithinEra: boolean;
  evidenceVersionValid: boolean;
  themeAttributionValid: boolean;
  referenceTotalCapital: number;
  availableCash: number;
  currentAgMarketValue: number;
  currentPositionMarketValue: number;
  currentThemeMarketValue: number;
  sleeveDrawdownPct: number;
  price: number;
  liquidityEligible: boolean;
  thesisValid: boolean;
  reassessmentComplete?: boolean;
};

export function previewAgBuySizing(input: AgBuySizingPreflightInput) {
  const preflightReasons: string[] = [];
  if (input.portfolioType !== "paper_active" || input.isRealMoney) preflightReasons.push("Only a non-real-money paper_active portfolio is eligible.");
  if (input.strategyKey !== "accelerated_growth" || input.executionMode !== "paper" || !input.eraOpen) preflightReasons.push("An open paper Accelerated Growth strategy era is required.");
  if (input.decisionSource !== "ai_committee" || input.decisionType !== "buy" || input.decisionStatus !== "active") preflightReasons.push("An active persisted Committee BUY is required.");
  if (input.decisionAlreadyExecuted) preflightReasons.push("The BUY is already linked to a transaction.");
  if (!input.decisionWithinEra) preflightReasons.push("The BUY predates the active strategy era.");
  if (!input.evidenceVersionValid || !input.themeAttributionValid) preflightReasons.push("Current persisted execution evidence and theme attribution are required.");

  const numbers = [input.referenceTotalCapital, input.availableCash, input.currentAgMarketValue, input.currentPositionMarketValue, input.currentThemeMarketValue, input.sleeveDrawdownPct, input.price];
  if (numbers.some((value) => !Number.isFinite(value)) || input.referenceTotalCapital <= 0 || input.price <= 0 ||
      input.availableCash < 0 || input.currentAgMarketValue < 0 || input.currentPositionMarketValue < 0 ||
      input.currentThemeMarketValue < 0 || input.sleeveDrawdownPct < 0) {
    preflightReasons.push("Finite, nonnegative portfolio figures and positive capital and price are required.");
  }

  if (preflightReasons.length) return { eligible: false, reasons: preflightReasons, guardrails: null, sizing: null, mode: "read_only" as const };

  const isExistingPosition = input.currentPositionMarketValue > 0;
  const guardrails = evaluateAgPortfolioGuardrails({
    referenceTotalCapital: input.referenceTotalCapital,
    currentAgMarketValue: input.currentAgMarketValue,
    currentThemeMarketValue: input.currentThemeMarketValue,
    currentPositionMarketValue: input.currentPositionMarketValue,
    availableCash: input.availableCash,
    sleeveDrawdownPct: input.sleeveDrawdownPct,
    liquidityEligible: input.liquidityEligible,
    thesisValid: input.thesisValid,
    reassessmentComplete: input.reassessmentComplete ?? false,
  });
  if (!guardrails.buyAllowed) return { eligible: false, reasons: guardrails.reasons, guardrails, sizing: null, mode: "read_only" as const };

  const sizing = sizeAgBuy({
    referenceTotalCapital: input.referenceTotalCapital,
    availableCash: input.availableCash,
    currentAgMarketValue: input.currentAgMarketValue,
    currentPositionMarketValue: input.currentPositionMarketValue,
    currentThemeMarketValue: input.currentThemeMarketValue,
    price: input.price,
    committeeDecision: "BUY",
    liquidityEligible: input.liquidityEligible,
    thesisValid: input.thesisValid,
    isExistingPosition,
    allowAdd: isExistingPosition ? guardrails.addAllowed : undefined,
  });
  return { eligible: sizing.eligible, reasons: sizing.reasons, guardrails, sizing, mode: "read_only" as const };
}
