export type PositionSizingMode =
  | "paper_active"
  | "paper_long_term";

export type PositionSizingInput = {
  portfolioMode: PositionSizingMode;

  portfolioTotalValue: number;
  availableCash: number;

  currentPrice: number;

  currentHoldingMarketValue: number;

  confidenceScore: number;

  riskLevel:
    | "low"
    | "medium"
    | "high";

  fractionalSharePrecision?: number;
};

export type PositionSizingResult = {
  currentWeightPct: number;

  targetWeightPct: number;
  maxWeightPct: number;

  targetPositionValue: number;
  maxPositionValue: number;

  additionalCapitalNeeded: number;
  suggestedInitialCapital: number;

  suggestedShares: number;
  actualPurchaseValue: number;

  cashAfterPurchase: number;

  constrainedByCash: boolean;
  constrainedByMaxWeight: boolean;
};

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function roundCurrency(
  value: number
) {
  return Number(
    value.toFixed(2)
  );
}

function roundShares(
  value: number,
  precision: number
) {
  return Number(
    value.toFixed(precision)
  );
}

function getBaseSizing(
  mode: PositionSizingMode
) {
  if (
    mode === "paper_active"
  ) {
    return {
      targetWeightPct: 3,
      maxWeightPct: 6,
      initialFraction: 0.5,
    };
  }

  return {
    targetWeightPct: 5,
    maxWeightPct: 10,
    initialFraction: 0.5,
  };
}

function getConfidenceAdjustment(
  confidenceScore: number
) {
  if (confidenceScore >= 90) {
    return 1.2;
  }

  if (confidenceScore >= 80) {
    return 1.1;
  }

  if (confidenceScore >= 70) {
    return 1;
  }

  if (confidenceScore >= 60) {
    return 0.8;
  }

  return 0.6;
}

function getRiskAdjustment(
  riskLevel:
    | "low"
    | "medium"
    | "high"
) {
  if (riskLevel === "low") {
    return 1.1;
  }

  if (riskLevel === "high") {
    return 0.7;
  }

  return 1;
}

export function calculatePositionSizing(
  input: PositionSizingInput
): PositionSizingResult {
  const {
    portfolioMode,
    portfolioTotalValue,
    availableCash,
    currentPrice,
    currentHoldingMarketValue,
    confidenceScore,
    riskLevel,
    fractionalSharePrecision = 4,
  } = input;

  if (
    portfolioTotalValue <= 0
  ) {
    throw new Error(
      "Portfolio total value must be greater than zero."
    );
  }

  if (
    currentPrice <= 0
  ) {
    throw new Error(
      "Current price must be greater than zero."
    );
  }

  const base =
    getBaseSizing(
      portfolioMode
    );

  const confidenceAdjustment =
    getConfidenceAdjustment(
      confidenceScore
    );

  const riskAdjustment =
    getRiskAdjustment(
      riskLevel
    );

  const adjustedTargetWeight =
    base.targetWeightPct *
    confidenceAdjustment *
    riskAdjustment;

  const targetWeightPct =
    clamp(
      adjustedTargetWeight,
      1,
      base.maxWeightPct
    );

  const maxWeightPct =
    base.maxWeightPct;

  const currentWeightPct =
    (
      currentHoldingMarketValue /
      portfolioTotalValue
    ) * 100;

  const targetPositionValue =
    portfolioTotalValue *
    (
      targetWeightPct /
      100
    );

  const maxPositionValue =
    portfolioTotalValue *
    (
      maxWeightPct /
      100
    );

  const rawAdditionalCapital =
    Math.max(
      0,
      targetPositionValue -
        currentHoldingMarketValue
    );

  const maxAdditionalCapital =
    Math.max(
      0,
      maxPositionValue -
        currentHoldingMarketValue
    );

  const constrainedByMaxWeight =
    rawAdditionalCapital >
    maxAdditionalCapital;

  const capitalBeforeCashLimit =
    Math.min(
      rawAdditionalCapital,
      maxAdditionalCapital
    );

  const constrainedByCash =
    capitalBeforeCashLimit >
    availableCash;

  const additionalCapitalNeeded =
    Math.min(
      capitalBeforeCashLimit,
      availableCash
    );

  const suggestedInitialCapital =
    additionalCapitalNeeded *
    base.initialFraction;

  const rawSuggestedShares =
    suggestedInitialCapital /
    currentPrice;

  const suggestedShares =
    roundShares(
      rawSuggestedShares,
      fractionalSharePrecision
    );

  const actualPurchaseValue =
    suggestedShares *
    currentPrice;

  const cashAfterPurchase =
    availableCash -
    actualPurchaseValue;

  return {
    currentWeightPct:
      Number(
        currentWeightPct.toFixed(
          2
        )
      ),

    targetWeightPct:
      Number(
        targetWeightPct.toFixed(
          2
        )
      ),

    maxWeightPct:
      Number(
        maxWeightPct.toFixed(2)
      ),

    targetPositionValue:
      roundCurrency(
        targetPositionValue
      ),

    maxPositionValue:
      roundCurrency(
        maxPositionValue
      ),

    additionalCapitalNeeded:
      roundCurrency(
        additionalCapitalNeeded
      ),

    suggestedInitialCapital:
      roundCurrency(
        suggestedInitialCapital
      ),

    suggestedShares,

    actualPurchaseValue:
      roundCurrency(
        actualPurchaseValue
      ),

    cashAfterPurchase:
      roundCurrency(
        cashAfterPurchase
      ),

    constrainedByCash,

    constrainedByMaxWeight,
  };
}