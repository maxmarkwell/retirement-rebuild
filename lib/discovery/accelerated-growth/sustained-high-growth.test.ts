import { strict as assert } from "node:assert";
import { qualifiesSustainedHighGrowth } from "./sustained-high-growth";
import { scoreAcceleratedGrowthCandidate } from "./scoring";
import type { AcceleratedGrowthFundamentals } from "./types";

const growth = [24.1158, 30.1326, 22.7412, 29.0475];
const margins = [19.482, 16.365, 21.073, 20.491];
const fcf = [925300000, 652800000, 883900000, 462000000];
const acceleration: AcceleratedGrowthFundamentals = {
  symbol: "VRT",
  quarters: [...growth, 12, 14, 16, 18].map((revenueGrowthYoY, i) => ({
    date: null, fiscalYear: null, period: null, revenue: null,
    operatingIncome: null, netIncome: null, freeCashFlow: fcf[i] ?? 100000000,
    revenueGrowthYoY, operatingMargin: margins[i], freeCashFlowMargin: 20,
  })),
  revenueAcceleration: -6, operatingMarginChange: 3, freeCashFlowMarginChange: 3,
  revenueTrajectory: { latest: growth[0], slope: -0.74, recentChange: -6, consistency: -1/3, pointCount: 4 },
  operatingMarginTrajectory: { latest: margins[0], slope: -0.77, recentChange: 3, consistency: 1/3, pointCount: 4 },
  freeCashFlowMarginTrajectory: { latest: 28, slope: 2.69, recentChange: 3, consistency: 1/3, pointCount: 4 },
  accelerationDirection: "stable",
  dataQuality: { quarterCount: 8, comparableRevenueGrowthPoints: 4, hasQuarterlyIncome: true, hasQuarterlyCashFlow: true, eligibleForScoring: true },
};
const quality = { roic: 20.8766, freeCashFlow: 1887400000, netDebtToEbitda: 0.20665, currentRatio: 1.38 };
assert.equal(qualifiesSustainedHighGrowth(acceleration, quality), true);
const score = scoreAcceleratedGrowthCandidate({
  acceleration, quality,
  earnings: { latestEpsSurprisePct: 7.04, previousEpsSurprisePct: 17, latestRevenueSurprisePct: -3.1, previousRevenueSurprisePct: 0.4 },
  valuation: { freeCashFlowYield: 2.5, priceToSales: 7.38, priceToFreeCashFlow: 39.97 },
});
assert.equal(score.status, "ADVANCE");
assert.ok(score.total < 68, "Alternative path should be exercised rather than old threshold");
assert.equal(qualifiesSustainedHighGrowth({ ...acceleration, accelerationDirection: "strongly_decelerating" }, quality), false);
assert.equal(qualifiesSustainedHighGrowth({ ...acceleration, quarters: acceleration.quarters.map((q, i) => i === 2 ? { ...q, revenueGrowthYoY: 10 } : q) }, quality), false);
assert.equal(qualifiesSustainedHighGrowth(acceleration, { ...quality, freeCashFlow: -1 }), false);
assert.equal(qualifiesSustainedHighGrowth(acceleration, { ...quality, netDebtToEbitda: 4 }), false);
assert.equal(qualifiesSustainedHighGrowth(acceleration, { ...quality, roic: null }), false);
assert.equal(qualifiesSustainedHighGrowth({ ...acceleration, dataQuality: { ...acceleration.dataQuality, comparableRevenueGrowthPoints: 2 } }, quality), false);
assert.equal(qualifiesSustainedHighGrowth({ ...acceleration, quarters: acceleration.quarters.slice(0, 2) }, quality), false);
assert.equal(scoreAcceleratedGrowthCandidate({ acceleration: { ...acceleration, accelerationDirection: "strongly_decelerating" }, quality }).status, "REJECT");
