import {
  getDynamicDiscoveryUniverse,
  type DynamicUniverseStock,
  type MarketCapBucket,
} from "./dynamic-universe";
import { preScreenDynamicUniverse } from "./pre-screen";
import {
  getLightFundamentals,
  type LightFundamentals,
} from "./light-fundamentals";

export type FundamentalScreenCandidate = {
  stock: DynamicUniverseStock;
  fundamentals: LightFundamentals;

  passed: boolean;

  reasons: string[];
};

export type FundamentalScreenResult = {
  inputCount: number;
  evaluatedCount: number;
  passedCount: number;
  failedCount: number;

  bucketCounts: Record<
    MarketCapBucket,
    number
  >;

  passed: FundamentalScreenCandidate[];
  failed: FundamentalScreenCandidate[];
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] =
    new Array(items.length);

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index]
        );
    }
  }

  const workers =
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            items.length
          ),
      },
      () => runWorker()
    );

  await Promise.all(
    workers
  );

  return results;
}

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

function emptyFundamentals(
  ticker: string
): LightFundamentals {
  return {
    ticker,

    revenue:
      null,

    revenueGrowthPct:
      null,

    operatingMarginPct:
      null,

    freeCashFlow:
      null,

    netDebtToEbitda:
      null,

    returnOnInvestedCapitalPct:
      null,

    freeCashFlowYieldPct:
      null,
  };
}

function evaluateCandidate(
  stock: DynamicUniverseStock,
  fundamentals: LightFundamentals
): FundamentalScreenCandidate {
  const reasons: string[] =
    [];

  let passed = true;

  const bucket =
    stock.marketCapBucket;

  // ---------------------------------------------------------
  // Revenue
  // ---------------------------------------------------------

  if (
    fundamentals.revenue ==
      null ||
    fundamentals.revenue <= 0
  ) {
    passed = false;

    reasons.push(
      "No meaningful reported revenue."
    );
  }

  // ---------------------------------------------------------
  // Revenue growth
  // ---------------------------------------------------------

  const growth =
    fundamentals
      .revenueGrowthPct;

  if (
    growth != null
  ) {
    if (
      bucket === "small" ||
      bucket === "mid"
    ) {
      if (growth < -10) {
        passed = false;

        reasons.push(
          "Revenue is declining more than 10%."
        );
      }
    } else {
      if (growth < -5) {
        passed = false;

        reasons.push(
          "Revenue is declining more than 5%."
        );
      }
    }
  }

  // ---------------------------------------------------------
  // Operating profitability
  // ---------------------------------------------------------

  const operatingMargin =
    fundamentals
      .operatingMarginPct;

  if (
    operatingMargin != null
  ) {
    if (
      bucket === "large" ||
      bucket === "mega"
    ) {
      if (
        operatingMargin < 0
      ) {
        passed = false;

        reasons.push(
          "Operating margin is negative."
        );
      }
    } else {
      /*
        Small and mid caps get more room.
        We don't want to eliminate emerging
        businesses solely because they're
        not yet fully mature.
      */

      if (
        operatingMargin <
        -20
      ) {
        passed = false;

        reasons.push(
          "Operating losses are too large."
        );
      }
    }
  }

  // ---------------------------------------------------------
  // Free cash flow
  // ---------------------------------------------------------

  const freeCashFlow =
    fundamentals
      .freeCashFlow;

  if (
    bucket === "large" ||
    bucket === "mega"
  ) {
    if (
      freeCashFlow != null &&
      freeCashFlow <= 0
    ) {
      passed = false;

      reasons.push(
        "Free cash flow is not positive."
      );
    }
  }

  /*
    Small and mid caps are not automatically
    rejected for negative FCF. Some emerging
    companies may be worth deeper review if
    growth and operating economics are strong.
  */

  // ---------------------------------------------------------
  // Leverage
  // ---------------------------------------------------------

  const leverage =
    fundamentals
      .netDebtToEbitda;

  if (
    leverage != null &&
    Number.isFinite(
      leverage
    )
  ) {
    if (
      leverage > 6
    ) {
      passed = false;

      reasons.push(
        "Net debt / EBITDA exceeds 6x."
      );
    }
  }

  // ---------------------------------------------------------
  // ROIC
  // ---------------------------------------------------------

  const roic =
    fundamentals
      .returnOnInvestedCapitalPct;

  if (
    roic != null &&
    roic < -25
  ) {
    passed = false;

    reasons.push(
      "ROIC is severely negative."
    );
  }

  if (
    passed
  ) {
    reasons.push(
      "Passed light fundamental screen."
    );
  }

  return {
    stock,
    fundamentals,
    passed,
    reasons,
  };
}

export async function runFundamentalScreen(): Promise<
  FundamentalScreenResult
> {
  const universe =
    await getDynamicDiscoveryUniverse();

  const preScreen =
    preScreenDynamicUniverse(
      universe
    );

  const evaluated:
    FundamentalScreenCandidate[] =
    [];

  const batchSize = 20;

  /*
    getLightFundamentals currently makes
    approximately 3 FMP requests per stock.

    20 stocks ~= 60 requests.

    A 15-second pause between batches keeps
    the sustained request rate comfortably
    below the Starter-plan ceiling while
    still allowing each batch to run with
    limited concurrency.
  */

  for (
    let start = 0;
    start <
    preScreen.selected.length;
    start += batchSize
  ) {
    const batch =
      preScreen.selected.slice(
        start,
        start + batchSize
      );

    const batchResults =
      await mapWithConcurrency(
        batch,
        4,
        async (stock) => {
          try {
            const fundamentals =
              await getLightFundamentals(
                stock.ticker
              );

            /*
              Recalculate FCF yield ourselves.

              This is more reliable than trusting
              the provider's derived FCF-yield
              field when the underlying FCF and
              market-cap values are available.
            */

            if (
              fundamentals.freeCashFlow != null &&
              stock.marketCap > 0
            ) {
              fundamentals.freeCashFlowYieldPct =
                (
                  fundamentals.freeCashFlow /
                  stock.marketCap
                ) * 100;
            } else {
              fundamentals.freeCashFlowYieldPct =
                null;
            }

            return evaluateCandidate(
              stock,
              fundamentals
            );
          } catch (error) {
            return {
              stock,

              fundamentals:
                emptyFundamentals(
                  stock.ticker
                ),

              passed:
                false,

              reasons: [
                error instanceof Error
                  ? error.message
                  : "Unable to load light fundamentals.",
              ],
            };
          }
        }
      );

    evaluated.push(
      ...batchResults
    );

    const hasMore =
      start +
        batchSize <
      preScreen.selected.length;

    if (hasMore) {
      await sleep(
        15_000
      );
    }
  }

  const passed =
    evaluated.filter(
      (candidate) =>
        candidate.passed
    );

  const failed =
    evaluated.filter(
      (candidate) =>
        !candidate.passed
    );

  const bucketCounts:
    Record<
      MarketCapBucket,
      number
    > = {
      small: 0,
      mid: 0,
      large: 0,
      mega: 0,
    };

  for (
    const candidate
    of passed
  ) {
    bucketCounts[
      candidate.stock
        .marketCapBucket
    ] += 1;
  }

  return {
    inputCount:
      preScreen.selectedCount,

    evaluatedCount:
      evaluated.length,

    passedCount:
      passed.length,

    failedCount:
      failed.length,

    bucketCounts,

    passed,

    failed,
  };
}