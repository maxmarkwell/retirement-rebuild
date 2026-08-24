import {
  runDeepResearch,
  type DeepResearchCandidate,
} from "./deep-research";

import {
  scoreDeepDiscoveryCandidate,
  type DeepDiscoveryScore,
} from "./deep-scoring";

import {
  calculatePortfolioFitScore,
} from "./portfolio-fit";

import type {
  MarketCapBucket,
} from "./dynamic-universe";

export type DiscoveryV2PortfolioContext = {
  portfolioTotalValue: number;
  availableCash: number;

  holdingsByTicker: Record<
    string,
    {
      marketValue: number;
    }
  >;

  sectorMarketValues: Record<
    string,
    number
  >;
};

export type DiscoveryV2Candidate = {
  ticker: string;

  companyName:
    string | null;

  sector:
    string | null;

  industry:
    string | null;

  marketCapBucket:
    MarketCapBucket;

  marketCap:
    number | null;

  selectorScore:
    number;

  deepScore:
    DeepDiscoveryScore;

  portfolioFitScore:
    number;

  finalScore:
    number;

  revenueGrowth:
    number | null;

  operatingMargin:
    number | null;

  returnOnInvestedCapital:
    number | null;

  freeCashFlowYield:
    number | null;

  shareCountChangePct:
    number | null;
};

export type DiscoveryV2Result = {
  researchedCount: number;
  scoredCount: number;

  candidates:
    DiscoveryV2Candidate[];
};

function roundScore(
  value: number
) {
  return Number(
    value.toFixed(2)
  );
}

function isCompletedCandidate(
  candidate: DeepResearchCandidate
): candidate is DeepResearchCandidate & {
  fundamentals: NonNullable<
    DeepResearchCandidate["fundamentals"]
  >;

  trends: NonNullable<
    DeepResearchCandidate["trends"]
  >;
} {
  return (
    candidate.error == null &&
    candidate.fundamentals != null &&
    candidate.trends != null
  );
}

export async function runDiscoveryV2(
  portfolioContext?:
    DiscoveryV2PortfolioContext
): Promise<DiscoveryV2Result> {
  const research =
    await runDeepResearch();

  const candidates =
    research.candidates
      .filter(
        isCompletedCandidate
      )
      .map(
        (
          candidate
        ): DiscoveryV2Candidate => {
          const deepScore =
            scoreDeepDiscoveryCandidate(
              candidate.fundamentals,
              candidate.trends
            );

          const ticker =
            candidate.ticker
              .trim()
              .toUpperCase();

          const sector =
            candidate.sector ??
            "Unknown";

          const currentHoldingMarketValue =
            portfolioContext
              ?.holdingsByTicker[
                ticker
              ]?.marketValue ??
            0;

          const currentSectorMarketValue =
            portfolioContext
              ?.sectorMarketValues[
                sector
              ] ??
            0;

          const portfolioFitScore =
            portfolioContext
              ? calculatePortfolioFitScore({
                  ticker,

                  candidateSector:
                    sector,

                  portfolioTotalValue:
                    portfolioContext
                      .portfolioTotalValue,

                  availableCash:
                    portfolioContext
                      .availableCash,

                  currentHoldingMarketValue,

                  currentSectorMarketValue,
                })
              : 50;

          /*
            Deep investment quality remains the
            dominant ranking factor.

            Portfolio Fit is deliberately limited
            to 10% so diversification cannot turn
            a mediocre business into a top idea.
          */

          const finalScore =
            deepScore.totalScore *
              0.9 +
            portfolioFitScore *
              0.1;

          return {
            ticker,

            companyName:
              candidate.companyName,

            sector:
              candidate.sector,

            industry:
              candidate.industry,

            marketCapBucket:
              candidate.marketCapBucket,

            marketCap:
              candidate.fundamentals
                .marketCap,

            selectorScore:
              candidate.selectorScore,

            deepScore,

            portfolioFitScore:
              roundScore(
                portfolioFitScore
              ),

            finalScore:
              roundScore(
                finalScore
              ),

            revenueGrowth:
              candidate.fundamentals
                .revenueGrowth,

            operatingMargin:
              candidate.fundamentals
                .operatingMargin,

            returnOnInvestedCapital:
              candidate.fundamentals
                .returnOnInvestedCapital,

            freeCashFlowYield:
              candidate.fundamentals
                .freeCashFlowYield,

            shareCountChangePct:
              candidate.trends
                .shareCount
                .percentChange,
          };
        }
      )
      .sort(
        (a, b) =>
          b.finalScore -
          a.finalScore
      );

  return {
    researchedCount:
      research.completedCount,

    scoredCount:
      candidates.length,

    candidates,
  };
}