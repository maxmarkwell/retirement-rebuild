import { createClient } from "@/lib/supabase/server";

import {
  calculatePortfolioAccounting,
} from "@/lib/portfolio/accounting";

import {
  getMarketQuotes,
} from "@/lib/market-data/twelve-data";

import {
  getDynamicDiscoveryUniverse,
} from "./dynamic-universe";

import {
  calculatePortfolioFitScore,
} from "./portfolio-fit";

import {
  scoreDeepDiscoveryCandidate,
} from "./deep-scoring";

import type {
  CompanyFundamentals,
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

import type {
  DiscoveryPortfolioMode,
} from "./types";

export type FinalizeDeepResearchResult = {
  ticker: string;

  companyName:
    string | null;

  sector:
    string | null;

  industry:
    string | null;

  marketCapBucket:
    "small" |
    "mid" |
    "large" |
    "mega";

  selectorScore:
    number;

  fundamentals:
    CompanyFundamentals | null;

  trends:
    CompanyFundamentalTrends | null;

  error:
    string | null;
};

export type FinalizeDiscoveryScanResult = {
  savedCount: number;

  completedCount: number;

  topCandidates: {
    ticker: string;

    finalScore: number;

    deepScore: number;

    portfolioFitScore: number;
  }[];
};

function roundScore(
  value: number
) {
  return Number(
    value.toFixed(2)
  );
}

export async function finalizeDiscoveryScan(
  scanRunId: string,
  portfolioMode:
    DiscoveryPortfolioMode,
  deepResearchResults:
    FinalizeDeepResearchResult[]
): Promise<FinalizeDiscoveryScanResult> {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "You must be signed in."
    );
  }

  // ---------------------------------------------------------
  // Load active portfolio
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } =
    await supabase
      .from("portfolios")
      .select("*")
      .eq(
        "type",
        portfolioMode
      )
      .eq(
        "is_active",
        true
      )
      .single();

  if (
    portfolioError ||
    !portfolio
  ) {
    throw new Error(
      `Unable to load discovery portfolio: ${
        portfolioError?.message ??
        "Portfolio not found."
      }`
    );
  }

  // ---------------------------------------------------------
  // Load contributions
  // ---------------------------------------------------------

  const {
    data: contributions,
    error:
      contributionsError,
  } =
    await supabase
      .from(
        "contributions"
      )
      .select(
        "portfolio_id, amount"
      )
      .eq(
        "portfolio_id",
        portfolio.id
      );

  if (
    contributionsError
  ) {
    throw new Error(
      `Unable to load contributions: ${contributionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load transactions
  // ---------------------------------------------------------

  const {
    data: transactions,
    error:
      transactionsError,
  } =
    await supabase
      .from(
        "transactions"
      )
      .select(
        "portfolio_id, transaction_type, ticker, quantity, gross_amount, fees, transaction_date, created_at"
      )
      .eq(
        "portfolio_id",
        portfolio.id
      )
      .order(
        "transaction_date",
        {
          ascending: true,
        }
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      );

  if (
    transactionsError
  ) {
    throw new Error(
      `Unable to load transactions: ${transactionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Determine held tickers
  // ---------------------------------------------------------

  const heldTickers =
    Array.from(
      new Set(
        (transactions ?? [])
          .filter(
            (transaction) =>
              transaction.ticker &&
              (
                transaction
                  .transaction_type ===
                  "buy" ||
                transaction
                  .transaction_type ===
                  "sell"
              )
          )
          .map(
            (transaction) =>
              transaction.ticker
                .trim()
                .toUpperCase()
          )
      )
    );

  // ---------------------------------------------------------
  // Load live prices
  // ---------------------------------------------------------

  const marketPrices:
    Record<string, number> =
    {};

  if (
    heldTickers.length > 0
  ) {
    try {
      const quotes =
        await getMarketQuotes(
          heldTickers
        );

      for (
        const [
          ticker,
          quote,
        ] of Object.entries(
          quotes
        )
      ) {
        marketPrices[
          ticker
        ] =
          quote.price;
      }
    } catch (error) {
      console.error(
        "Unable to load market prices for Discovery V2 final scoring:",
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Calculate portfolio state
  // ---------------------------------------------------------

  const accounting =
    calculatePortfolioAccounting(
      portfolio,
      contributions ?? [],
      transactions ?? [],
      marketPrices
    );

  const holdingsByTicker =
    Object.fromEntries(
      accounting.holdings.map(
        (holding) => [
          holding.ticker
            .trim()
            .toUpperCase(),

          {
            marketValue:
              holding.marketValue,
          },
        ]
      )
    );

  // ---------------------------------------------------------
  // Build authoritative sector map
  // ---------------------------------------------------------

  /*
    This is one dynamic-universe fetch for the
    final stage, not one fetch per batch.

    It ensures current portfolio holdings that
    were not among the 95 research finalists
    still contribute to sector concentration.
  */

  const universe =
    await getDynamicDiscoveryUniverse();

  const sectorByTicker =
    new Map(
      universe.map(
        (stock) => [
          stock.ticker
            .trim()
            .toUpperCase(),

          stock.sector ??
            "Unknown",
        ]
      )
    );

  const sectorMarketValues:
    Record<string, number> =
    {};

  for (
    const holding
    of accounting.holdings
  ) {
    const ticker =
      holding.ticker
        .trim()
        .toUpperCase();

    const sector =
      sectorByTicker.get(
        ticker
      );

    if (!sector) {
      continue;
    }

    sectorMarketValues[
      sector
    ] =
      (
        sectorMarketValues[
          sector
        ] ?? 0
      ) +
      holding.marketValue;
  }

  const portfolioTotalValue =
    accounting.permanentCapital;

  const availableCash =
    accounting.cash;

  // ---------------------------------------------------------
  // Score completed deep-research candidates
  // ---------------------------------------------------------

  const completed =
    deepResearchResults.filter(
      (
        candidate
      ): candidate is
        FinalizeDeepResearchResult & {
          fundamentals:
            CompanyFundamentals;

          trends:
            CompanyFundamentalTrends;
        } =>
        candidate.error ==
          null &&
        candidate.fundamentals !=
          null &&
        candidate.trends !=
          null
    );

  const scored =
    completed
      .map(
        (candidate) => {
          const ticker =
            candidate.ticker
              .trim()
              .toUpperCase();

          const sector =
            candidate.sector ??
            "Unknown";

          const deepScore =
            scoreDeepDiscoveryCandidate(
              candidate.fundamentals,
              candidate.trends
            );

          const currentHoldingMarketValue =
            holdingsByTicker[
              ticker
            ]?.marketValue ??
            0;

          const currentSectorMarketValue =
            sectorMarketValues[
              sector
            ] ??
            0;

          const portfolioFitScore =
            calculatePortfolioFitScore({
              ticker,

              candidateSector:
                sector,

              portfolioTotalValue,

              availableCash,

              currentHoldingMarketValue,

              currentSectorMarketValue,
            });

          const finalScore =
            deepScore.totalScore *
              0.9 +
            portfolioFitScore *
              0.1;

          return {
            candidate,

            ticker,

            deepScore,

            portfolioFitScore:
              roundScore(
                portfolioFitScore
              ),

            finalScore:
              roundScore(
                finalScore
              ),
          };
        }
      )
      .sort(
        (a, b) =>
          b.finalScore -
          a.finalScore
      );

  // ---------------------------------------------------------
  // Discovery date
  // ---------------------------------------------------------

  const discoveryDate =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Denver",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    ).format(
      new Date()
    );

  // ---------------------------------------------------------
  // Persist V2 candidates
  // ---------------------------------------------------------

  const rows =
    scored.map(
      ({
        candidate,
        ticker,
        deepScore,
        portfolioFitScore,
        finalScore,
      }) => ({
        user_id:
          user.id,

        portfolio_type:
          portfolioMode,

        ticker,

        discovery_date:
          discoveryDate,

        quality_score:
          deepScore
            .components
            .quality,

        growth_score:
          deepScore
            .components
            .growth,

        valuation_score:
          deepScore
            .components
            .valuation,

        /*
          Legacy V1 fields remain zero for
          V2 instead of being repurposed.
        */

        earnings_score:
          0,

        risk_score:
          0,

        trend_quality_score:
          deepScore
            .components
            .trendQuality,

        capital_discipline_score:
          deepScore
            .components
            .capitalDiscipline,

        deep_score:
          deepScore
            .totalScore,

        selector_score:
          candidate
            .selectorScore,

        portfolio_fit_score:
          portfolioFitScore,

        total_score:
          finalScore,

        market_cap_bucket:
          candidate
            .marketCapBucket,

        sector:
          candidate.sector,

        industry:
          candidate.industry,

        scoring_version:
          "v2",

        reason_summary:
          deepScore
            .reasonSummary,

        status:
          "new",
      })
    );

  if (
    rows.length > 0
  ) {
    const {
      error: saveError,
    } =
      await supabase
        .from(
          "stock_discovery_candidates"
        )
        .upsert(
          rows,
          {
            onConflict:
              "user_id,portfolio_type,ticker,discovery_date",
          }
        );

    if (saveError) {
      throw new Error(
        `Unable to save Discovery V2 candidates: ${saveError.message}`
      );
    }
  }

  // ---------------------------------------------------------
  // Complete scan run
  // ---------------------------------------------------------

  const {
    error: scanUpdateError,
  } =
    await supabase
      .from(
        "discovery_scan_runs"
      )
      .update({
        status:
          "completed",

        stage:
          "completed",

        completed_count:
          scored.length,

        failed_count:
          deepResearchResults.length -
          completed.length,

        completed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        scanRunId
      )
      .eq(
        "user_id",
        user.id
      );

  if (
    scanUpdateError
  ) {
    throw new Error(
      `Discovery candidates saved, but scan completion could not be recorded: ${scanUpdateError.message}`
    );
  }

  return {
    savedCount:
      rows.length,

    completedCount:
      completed.length,

    topCandidates:
      scored
        .slice(
          0,
          10
        )
        .map(
          (item) => ({
            ticker:
              item.ticker,

            finalScore:
              item.finalScore,

            deepScore:
              item.deepScore
                .totalScore,

            portfolioFitScore:
              item
                .portfolioFitScore,
          })
        ),
  };
}