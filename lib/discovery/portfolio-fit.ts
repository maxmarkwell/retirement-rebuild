type PortfolioFitInput = {
  ticker: string;
  candidateSector: string;

  portfolioTotalValue: number;
  availableCash: number;

  currentHoldingMarketValue: number;
  currentSectorMarketValue: number;
};

function clampScore(value: number) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

export function calculatePortfolioFitScore(
  input: PortfolioFitInput
) {
  const {
    portfolioTotalValue,
    availableCash,
    currentHoldingMarketValue,
    currentSectorMarketValue,
  } = input;

  if (portfolioTotalValue <= 0) {
    return 50;
  }

  const currentWeight =
    currentHoldingMarketValue /
    portfolioTotalValue;

  const sectorWeight =
    currentSectorMarketValue /
    portfolioTotalValue;

  const cashWeight =
    availableCash /
    portfolioTotalValue;

  let score = 60;

  // Existing position concentration
  if (currentWeight === 0) {
    score += 15;
  } else if (currentWeight < 0.03) {
    score += 8;
  } else if (currentWeight < 0.05) {
    score += 3;
  } else if (currentWeight < 0.08) {
    score -= 8;
  } else if (currentWeight < 0.10) {
    score -= 20;
  } else {
    score -= 40;
  }

  // ---------------------------------------------------------
// Sector diversification
// ---------------------------------------------------------

if (sectorWeight === 0) {
  // Adds exposure to a sector not currently represented.
  score += 10;
} else if (sectorWeight < 0.05) {
  // Sector exists, but exposure is still very small.
  score += 6;
} else if (sectorWeight < 0.10) {
  score += 2;
} else if (sectorWeight < 0.20) {
  score -= 5;
} else if (sectorWeight < 0.30) {
  score -= 15;
} else if (sectorWeight < 0.40) {
  score -= 25;
} else {
  score -= 35;
}
  // Available cash
  if (cashWeight >= 0.25) {
    score += 10;
  } else if (cashWeight >= 0.15) {
    score += 7;
  } else if (cashWeight >= 0.08) {
    score += 4;
  } else if (cashWeight < 0.03) {
    score -= 20;
  }

  if (availableCash <= 0) {
    score -= 30;
  }

  return Number(
    clampScore(score).toFixed(2)
  );
}