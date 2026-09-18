export const AG_RISK_CONSTITUTION_VERSION = "ag-risk-v1";

export type AgSizingInput = {
  referenceTotalCapital: number;
  availableCash: number;
  currentAgMarketValue: number;
  currentPositionMarketValue: number;
  currentThemeMarketValue: number;
  price: number;
  committeeDecision: "BUY" | "WATCH" | "REJECT";
  liquidityEligible: boolean;
  thesisValid: boolean;
  isExistingPosition?: boolean;
  allowAdd?: boolean;
};

export type AgSizingResult = {
  eligible: boolean;
  action: "START" | "ADD" | "NO_ACTION";
  targetNotional: number;
  quantity: number;
  constraints: {
    sleeveCap: number;
    positionCap: number;
    starterCap: number;
    themeCap: number;
    minimumBuyNotional: number;
  };
  bindingConstraint: string | null;
  reasons: string[];
  version: string;
};

const roundMoneyDown = (value: number) => Math.floor(Math.max(0, value) * 100) / 100;
const roundSharesDown = (value: number) => Math.floor(Math.max(0, value) * 1000) / 1000;

export function sizeAgBuy(input: AgSizingInput): AgSizingResult {
  const sleeveCap = roundMoneyDown(input.referenceTotalCapital * 0.20);
  const positionCap = roundMoneyDown(input.referenceTotalCapital * 0.05);
  const starterCap = roundMoneyDown(positionCap * 0.50);
  const themeCap = roundMoneyDown(input.referenceTotalCapital * 0.10);
  const minimumBuyNotional = 5;

  const constraints = { sleeveCap, positionCap, starterCap, themeCap, minimumBuyNotional };
  const reasons: string[] = [];

  if (!Number.isFinite(input.referenceTotalCapital) || input.referenceTotalCapital <= 0) reasons.push("Reference total capital must be positive.");
  if (!Number.isFinite(input.price) || input.price <= 0) reasons.push("A valid positive price is required.");
  if (input.committeeDecision !== "BUY") reasons.push("AG Committee has not established ownership merit.");
  if (!input.liquidityEligible) reasons.push("Candidate failed the deterministic AG liquidity gate.");
  if (!input.thesisValid) reasons.push("The AG thesis is not currently valid.");
  if (input.isExistingPosition && !input.allowAdd) reasons.push("Automatic averaging down/addition is prohibited; an explicit reassessment must authorize an add.");

  const remainingSleeve = roundMoneyDown(sleeveCap - input.currentAgMarketValue);
  const remainingPosition = roundMoneyDown(positionCap - input.currentPositionMarketValue);
  const remainingTheme = roundMoneyDown(themeCap - input.currentThemeMarketValue);
  const cashLimit = roundMoneyDown(input.availableCash);
  const entryLimit = input.isExistingPosition ? remainingPosition : starterCap;

  const limits = [
    ["AG sleeve cap", remainingSleeve],
    ["single-position cap", remainingPosition],
    ["theme cap", remainingTheme],
    ["available cash", cashLimit],
    [input.isExistingPosition ? "remaining position capacity" : "starter cap", entryLimit],
  ] as const;

  const rawTarget = Math.min(...limits.map(([, value]) => Math.max(0, value)));
  const targetNotional = roundMoneyDown(rawTarget);
  const bindingConstraint = limits.find(([, value]) => Math.max(0, value) === rawTarget)?.[0] ?? null;

  if (targetNotional < minimumBuyNotional) reasons.push(`Executable notional is below the $${minimumBuyNotional.toFixed(2)} minimum.`);

  if (reasons.length > 0) {
    return { eligible: false, action: "NO_ACTION", targetNotional: 0, quantity: 0, constraints, bindingConstraint, reasons, version: AG_RISK_CONSTITUTION_VERSION };
  }

  const quantity = roundSharesDown(targetNotional / input.price);
  const executableNotional = roundMoneyDown(quantity * input.price);

  if (quantity <= 0 || executableNotional < minimumBuyNotional) {
    return {
      eligible: false,
      action: "NO_ACTION",
      targetNotional: 0,
      quantity: 0,
      constraints,
      bindingConstraint,
      reasons: ["Three-decimal share rounding would produce an order below the minimum BUY notional."],
      version: AG_RISK_CONSTITUTION_VERSION,
    };
  }

  return {
    eligible: true,
    action: input.isExistingPosition ? "ADD" : "START",
    targetNotional: executableNotional,
    quantity,
    constraints,
    bindingConstraint,
    reasons: [],
    version: AG_RISK_CONSTITUTION_VERSION,
  };
}
