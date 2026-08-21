import { DISCOVERY_UNIVERSE } from "./universe";
import { getCompanyFundamentals } from "@/lib/company-data/fmp";
import { getCompanyEarningsContext } from "@/lib/company-data/earnings";
import { scoreDiscoveryCandidate } from "./scoring";
import { calculatePortfolioFitScore } from "./portfolio-fit";
import type {
  DiscoveryCandidate,
  DiscoveryPortfolioMode,
} from "./types";

export type DiscoveryScanFailure = {
  ticker: string;
  reason: string;
};

export type DiscoveryScanResult = {
  portfolioMode: DiscoveryPortfolioMode;

  universeCount: number;
  scoredCount: number;
  unavailableCount: number;

  openAiCalls: number;

  candidates: DiscoveryCandidate[];
  failures: DiscoveryScanFailure[];
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;

      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] =
        await worker(
          items[currentIndex]
        );
    }
  }

  const workers =
    Array.from(
      {
        length: Math.min(
          concurrency,
          items.length
        ),
      },
      () => runWorker()
    );

  await Promise.all(workers);

  return results;
}

export async function runDiscoveryScan(
  portfolioMode: DiscoveryPortfolioMode,
  portfolioContext?: {
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
  }
): Promise<DiscoveryScanResult> {
  const results =
    await mapWithConcurrency(
      DISCOVERY_UNIVERSE,
      4,
      async (stock) => {
        try {
          const [
            fundamentals,
            earnings,
          ] = await Promise.all([
            getCompanyFundamentals(
              stock.ticker
            ),
            getCompanyEarningsContext(
              stock.ticker
            ),
          ]);
          const currentHoldingMarketValue =
  portfolioContext
    ?.holdingsByTicker[
      stock.ticker
        .trim()
        .toUpperCase()
    ]?.marketValue ?? 0;

const currentSectorMarketValue =
  portfolioContext
    ?.sectorMarketValues[
      stock.sector
    ] ?? 0;

const portfolioFitScore =
  portfolioContext
    ? calculatePortfolioFitScore({
        ticker: stock.ticker,
        candidateSector:
          stock.sector,
        portfolioTotalValue:
          portfolioContext.portfolioTotalValue,
        availableCash:
          portfolioContext.availableCash,
        currentHoldingMarketValue,
        currentSectorMarketValue,
      })
    : 50;
const candidate =
  scoreDiscoveryCandidate({
    ticker:
      stock.ticker,

    portfolioMode,

    fundamentals,
    earnings,

    portfolioFitScore,
  });
          
          return {
            success:
              true as const,

            candidate,
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown discovery error.";

          return {
            success:
              false as const,

            failure: {
              ticker:
                stock.ticker,

              reason:
                message,
            },
          };
        }
      }
    );

  const candidates =
    results
      .filter(
        (
          result
        ): result is {
          success: true;
          candidate: DiscoveryCandidate;
        } =>
          result.success
      )
      .map(
        (result) =>
          result.candidate
      )
      .sort(
        (a, b) =>
          b.totalScore -
          a.totalScore
      );

  const failures =
    results
      .filter(
        (
          result
        ): result is {
          success: false;
          failure: DiscoveryScanFailure;
        } =>
          !result.success
      )
      .map(
        (result) =>
          result.failure
      );

  return {
    portfolioMode,

    universeCount:
      DISCOVERY_UNIVERSE.length,

    scoredCount:
      candidates.length,

    unavailableCount:
      failures.length,

    // Discovery itself does not use OpenAI.
    openAiCalls:
      0,

    candidates,

    failures,
  };
}