import type {
  AcceleratedGrowthFundamentals,
  AgDiscoveryScore,
} from "./types";

type EarningsConfirmationInput = {
  latestEpsSurprisePct?: number | null;
  previousEpsSurprisePct?: number | null;
  latestRevenueSurprisePct?: number | null;
  previousRevenueSurprisePct?: number | null;
};

type BusinessQualityInput = {
  roic?: number | null;
  freeCashFlow?: number | null;
  netDebtToEbitda?: number | null;
  currentRatio?: number | null;
};

type ValuationRewardInput = {
  freeCashFlowYield?: number | null;
  priceToSales?: number | null;
  priceToFreeCashFlow?: number | null;
};

export type AgScoringInput = {
  acceleration: AcceleratedGrowthFundamentals;
  earnings?: EarningsConfirmationInput | null;
  quality?: BusinessQualityInput | null;
  valuation?: ValuationRewardInput | null;
  marketConfirmation?: number | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function linearScore(
  value: number | null | undefined,
  bad: number,
  good: number
) {
  if (value == null || !Number.isFinite(value)) return 50;
  if (good === bad) return 50;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreFundamentalAcceleration(
  data: AcceleratedGrowthFundamentals
) {
  const revenue = linearScore(data.revenueAcceleration, -10, 15);
  const operatingMargin = linearScore(data.operatingMarginChange, -5, 5);
  const fcfMargin = linearScore(data.freeCashFlowMarginChange, -8, 8);

  // Revenue acceleration is the primary AG V1 quantitative signal.
  return clamp(
    revenue * 0.5 + operatingMargin * 0.3 + fcfMargin * 0.2
  );
}

function scoreEarnings(input?: EarningsConfirmationInput | null) {
  if (!input) return 50;

  return average([
    linearScore(input.latestEpsSurprisePct, -10, 15),
    linearScore(input.previousEpsSurprisePct, -10, 15),
    linearScore(input.latestRevenueSurprisePct, -5, 8),
    linearScore(input.previousRevenueSurprisePct, -5, 8),
  ]);
}

function scoreQuality(input?: BusinessQualityInput | null) {
  if (!input) return 50;

  const roic = linearScore(input.roic, 0, 20);
  const fcf = input.freeCashFlow == null
    ? 50
    : input.freeCashFlow > 0
      ? 75
      : 20;
  const leverage = input.netDebtToEbitda == null
    ? 50
    : 100 - linearScore(input.netDebtToEbitda, 0, 5);
  const liquidity = linearScore(input.currentRatio, 0.5, 2);

  return average([roic, fcf, leverage, liquidity]);
}

function scoreValuation(input?: ValuationRewardInput | null) {
  if (!input) return 50;

  const fcfYield = linearScore(input.freeCashFlowYield, 0, 8);
  const sales = input.priceToSales == null
    ? 50
    : 100 - linearScore(input.priceToSales, 2, 15);
  const fcf = input.priceToFreeCashFlow == null
    ? 50
    : 100 - linearScore(input.priceToFreeCashFlow, 15, 60);

  return average([fcfYield, sales, fcf]);
}

export function scoreAcceleratedGrowthCandidate(
  input: AgScoringInput
): AgDiscoveryScore {
  const fundamentalAcceleration = scoreFundamentalAcceleration(
    input.acceleration
  );
  const earningsConfirmation = scoreEarnings(input.earnings);
  const businessQuality = scoreQuality(input.quality);
  const valuationReward = scoreValuation(input.valuation);
  const marketConfirmation = input.marketConfirmation ?? null;

  // Until historical price capability is verified, redistribute the planned
  // market-confirmation weight across the four zero-incremental-cost pillars.
  // When market confirmation is present, use the intended five-pillar model.
  const total = marketConfirmation == null
    ? fundamentalAcceleration * 0.35 +
      earningsConfirmation * 0.25 +
      businessQuality * 0.20 +
      valuationReward * 0.20
    : fundamentalAcceleration * 0.30 +
      earningsConfirmation * 0.20 +
      marketConfirmation * 0.20 +
      businessQuality * 0.15 +
      valuationReward * 0.15;

  return {
    total: Math.round(clamp(total) * 10) / 10,
    components: {
      fundamentalAcceleration: Math.round(fundamentalAcceleration * 10) / 10,
      earningsConfirmation: Math.round(earningsConfirmation * 10) / 10,
      businessQuality: Math.round(businessQuality * 10) / 10,
      valuationReward: Math.round(valuationReward * 10) / 10,
      marketConfirmation:
        marketConfirmation == null
          ? null
          : Math.round(clamp(marketConfirmation) * 10) / 10,
    },
    version: "ag-discovery-v1",
  };
}
