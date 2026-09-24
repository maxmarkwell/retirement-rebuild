import { getCompanyEarningsContext } from "../../company-data/earnings";
import { getCompanyFundamentals } from "../../company-data/fmp";
import { getAcceleratedGrowthFundamentals } from "./fundamentals";
import { scoreAcceleratedGrowthCandidate } from "./scoring";
import type { MarketCapBucket } from "./types";

function marketCapBucket(marketCap: number | null): MarketCapBucket {
  if (marketCap == null || !Number.isFinite(marketCap) || marketCap <= 0) return "unknown";
  if (marketCap < 300_000_000) return "micro";
  if (marketCap < 2_000_000_000) return "small";
  if (marketCap < 10_000_000_000) return "mid";
  if (marketCap < 200_000_000_000) return "large";
  return "mega";
}

export async function evaluateAcceleratedGrowthCandidate(symbol: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const [acceleration, earnings, fundamentals] = await Promise.all([
    getAcceleratedGrowthFundamentals(normalizedSymbol),
    getCompanyEarningsContext(normalizedSymbol),
    getCompanyFundamentals(normalizedSymbol),
  ]);

  const score = scoreAcceleratedGrowthCandidate({
    acceleration,
    earnings: {
      latestEpsSurprisePct: earnings.latestReported?.epsSurprisePct ?? null,
      previousEpsSurprisePct: earnings.previousReported?.epsSurprisePct ?? null,
      latestRevenueSurprisePct: earnings.latestReported?.revenueSurprisePct ?? null,
      previousRevenueSurprisePct: earnings.previousReported?.revenueSurprisePct ?? null,
    },
    quality: {
      roic: fundamentals.returnOnInvestedCapital,
      freeCashFlow: fundamentals.freeCashFlow,
      netDebtToEbitda: fundamentals.netDebtToEbitda,
      currentRatio: fundamentals.currentRatio,
    },
    valuation: {
      freeCashFlowYield: fundamentals.freeCashFlowYield,
      priceToSales: fundamentals.priceToSalesRatio,
      priceToFreeCashFlow: fundamentals.priceToFreeCashFlowRatio,
    },
    marketConfirmation: null,
  });

  return {
    symbol: normalizedSymbol,
    companyName: fundamentals.companyName,
    marketCap: fundamentals.marketCap,
    marketCapBucket: marketCapBucket(fundamentals.marketCap),
    score,
    acceleration,
    earnings: {
      latestReported: earnings.latestReported,
      previousReported: earnings.previousReported,
      nextExpected: earnings.nextExpected,
    },
    quality: {
      returnOnInvestedCapital: fundamentals.returnOnInvestedCapital,
      freeCashFlow: fundamentals.freeCashFlow,
      netDebtToEbitda: fundamentals.netDebtToEbitda,
      currentRatio: fundamentals.currentRatio,
    },
    valuation: {
      freeCashFlowYield: fundamentals.freeCashFlowYield,
      priceToSalesRatio: fundamentals.priceToSalesRatio,
      priceToFreeCashFlowRatio: fundamentals.priceToFreeCashFlowRatio,
    },
  };
}
