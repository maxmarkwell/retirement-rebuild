import type { AcceleratedGrowthFundamentals } from "./types";

/**
 * Alternative research qualification, never an ownership or trade decision.
 * Requires sustained growth and verified economics; a single strong quarter
 * or a low valuation score cannot qualify a candidate by itself.
 */
export function qualifiesSustainedHighGrowth(
  acceleration: AcceleratedGrowthFundamentals,
  quality?: { roic?: number | null; freeCashFlow?: number | null; netDebtToEbitda?: number | null } | null,
): boolean {
  if (!acceleration.dataQuality.eligibleForScoring ||
      acceleration.dataQuality.comparableRevenueGrowthPoints < 4 ||
      acceleration.accelerationDirection === "strongly_decelerating") return false;

  const quarters = acceleration.quarters;
  const recent = quarters.slice(0, 4);
  if (recent.length !== 4 || recent.some(q =>
    q.revenueGrowthYoY == null || !Number.isFinite(q.revenueGrowthYoY) ||
    q.operatingMargin == null || !Number.isFinite(q.operatingMargin) ||
    q.freeCashFlow == null || !Number.isFinite(q.freeCashFlow))) return false;

  const growth = recent.map(q => q.revenueGrowthYoY!);
  const latest = recent[0];
  const averageGrowth = growth.reduce((sum, value) => sum + value, 0) / growth.length;
  const previous = recent[1];

  return growth.every(value => value >= 15) &&
    averageGrowth >= 20 &&
    latest.revenueGrowthYoY! >= 20 &&
    latest.operatingMargin! >= 15 &&
    latest.operatingMargin! >= previous.operatingMargin! - 2 &&
    latest.freeCashFlow! > 0 &&
    quality?.freeCashFlow != null && quality.freeCashFlow > 0 &&
    quality?.roic != null && Number.isFinite(quality.roic) && quality.roic >= 15 &&
    quality?.netDebtToEbitda != null &&
    Number.isFinite(quality.netDebtToEbitda) &&
    quality.netDebtToEbitda <= 2;
}
