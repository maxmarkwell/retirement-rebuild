import type {
  AcceleratedGrowthFundamentals,
  AgDiscoveryScore,
  AgQuantitativeStatus,
  TrajectoryMetrics,
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

function linearScore(value: number | null | undefined, bad: number, good: number) {
  if (value == null || !Number.isFinite(value)) return 50;
  if (good === bad) return 50;
  return clamp(((value - bad) / (good - bad)) * 100);
}

function availableAverage(values: Array<number | null>) {
  const usable = values.filter((value): value is number => value != null && Number.isFinite(value));
  return usable.length === 0 ? 50 : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function trajectoryScore(metrics: TrajectoryMetrics, kind: "revenue" | "margin") {
  if (metrics.pointCount < 3) return 35;
  const level = kind === "revenue" ? linearScore(metrics.latest, -5, 30) : 50;
  const slope = linearScore(metrics.slope, -5, 5);
  const recent = linearScore(metrics.recentChange, -5, 5);
  const consistency = linearScore(metrics.consistency, -1, 1);
  return kind === "revenue"
    ? clamp(level * 0.35 + slope * 0.35 + consistency * 0.20 + recent * 0.10)
    : clamp(slope * 0.50 + consistency * 0.30 + recent * 0.20);
}

function scoreFundamentalAcceleration(data: AcceleratedGrowthFundamentals) {
  if (!data.dataQuality.eligibleForScoring) return 25;
  const revenue = trajectoryScore(data.revenueTrajectory, "revenue");
  const operatingMargin = trajectoryScore(data.operatingMarginTrajectory, "margin");
  const fcfMargin = trajectoryScore(data.freeCashFlowMarginTrajectory, "margin");
  return clamp(revenue * 0.60 + operatingMargin * 0.25 + fcfMargin * 0.15);
}

function scoreEarnings(input?: EarningsConfirmationInput | null) {
  if (!input) return 50;
  return availableAverage([
    input.latestEpsSurprisePct == null ? null : linearScore(input.latestEpsSurprisePct, -10, 15),
    input.previousEpsSurprisePct == null ? null : linearScore(input.previousEpsSurprisePct, -10, 15),
    input.latestRevenueSurprisePct == null ? null : linearScore(input.latestRevenueSurprisePct, -5, 8),
    input.previousRevenueSurprisePct == null ? null : linearScore(input.previousRevenueSurprisePct, -5, 8),
  ]);
}

function scoreQuality(input?: BusinessQualityInput | null) {
  if (!input) return 50;
  return availableAverage([
    input.roic == null ? null : linearScore(input.roic, 0, 20),
    input.freeCashFlow == null ? null : input.freeCashFlow > 0 ? 75 : 20,
    input.netDebtToEbitda == null ? null : 100 - linearScore(input.netDebtToEbitda, 0, 5),
    input.currentRatio == null ? null : linearScore(input.currentRatio, 0.5, 2),
  ]);
}

function scoreValuation(input?: ValuationRewardInput | null) {
  if (!input) return 50;
  return availableAverage([
    input.freeCashFlowYield == null ? null : linearScore(input.freeCashFlowYield, 0, 8),
    input.priceToSales == null ? null : 100 - linearScore(input.priceToSales, 2, 15),
    input.priceToFreeCashFlow == null ? null : 100 - linearScore(input.priceToFreeCashFlow, 15, 60),
  ]);
}

function classifyStatus(
  acceleration: AcceleratedGrowthFundamentals,
  total: number,
  fundamentalAcceleration: number
): AgQuantitativeStatus {
  if (!acceleration.dataQuality.eligibleForScoring) return "INSUFFICIENT_DATA";

  const latestGrowth = acceleration.revenueTrajectory.latest ?? -Infinity;
  const revenueSlope = acceleration.revenueTrajectory.slope ?? -Infinity;
  const severeDeterioration =
    acceleration.accelerationDirection === "strongly_decelerating" ||
    (latestGrowth < 0 && revenueSlope < -1);

  if (severeDeterioration || fundamentalAcceleration < 30) return "REJECT";

  // ADVANCE means quantitative evidence is strong enough to justify the more
  // expensive catalyst/research stage. It is not a BUY recommendation.
  if (total >= 68 && fundamentalAcceleration >= 55 && latestGrowth >= 8) {
    return "ADVANCE";
  }

  return "REVIEW";
}

export function scoreAcceleratedGrowthCandidate(input: AgScoringInput): AgDiscoveryScore {
  const fundamentalAcceleration = scoreFundamentalAcceleration(input.acceleration);
  const earningsConfirmation = scoreEarnings(input.earnings);
  const businessQuality = scoreQuality(input.quality);
  const valuationReward = scoreValuation(input.valuation);
  const marketConfirmation = input.marketConfirmation ?? null;

  const total = marketConfirmation == null
    ? fundamentalAcceleration * 0.45 + earningsConfirmation * 0.25 + businessQuality * 0.20 + valuationReward * 0.10
    : fundamentalAcceleration * 0.40 + earningsConfirmation * 0.20 + marketConfirmation * 0.20 + businessQuality * 0.15 + valuationReward * 0.05;

  const roundedTotal = Math.round(clamp(total) * 10) / 10;

  return {
    total: roundedTotal,
    status: classifyStatus(input.acceleration, roundedTotal, fundamentalAcceleration),
    components: {
      fundamentalAcceleration: Math.round(fundamentalAcceleration * 10) / 10,
      earningsConfirmation: Math.round(earningsConfirmation * 10) / 10,
      businessQuality: Math.round(businessQuality * 10) / 10,
      valuationReward: Math.round(valuationReward * 10) / 10,
      marketConfirmation: marketConfirmation == null ? null : Math.round(clamp(marketConfirmation) * 10) / 10,
    },
    version: "ag-discovery-v1",
  };
}
