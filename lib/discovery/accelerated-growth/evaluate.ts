import { getCompanyEarningsContext } from "../../company-data/earnings";
import { getCompanyFundamentals } from "../../company-data/fmp";
import { getAcceleratedGrowthFundamentals } from "./fundamentals";
import { scoreAcceleratedGrowthCandidate } from "./scoring";

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
      latestRevenueSurprisePct:
        earnings.latestReported?.revenueSurprisePct ?? null,
      previousRevenueSurprisePct:
        earnings.previousReported?.revenueSurprisePct ?? null,
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
