import { createClient } from "@/lib/supabase/server";
import type { DiscoveryPortfolioMode } from "./types";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";
import { getDynamicDiscoveryUniverse } from "./dynamic-universe";
import { runDiscoveryV2 } from "./discovery-v2";

export async function runAndPersistDiscoveryScan(
  portfolioMode: DiscoveryPortfolioMode
) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "You must be signed in."
    );
  }

  // ---------------------------------------------------------
  // Load matching portfolio
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } = await supabase
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
    error: contributionsError,
  } = await supabase
    .from("contributions")
    .select(
      "portfolio_id, amount"
    )
    .eq(
      "portfolio_id",
      portfolio.id
    );

  if (contributionsError) {
    throw new Error(
      `Unable to load contributions: ${contributionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load transactions
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
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

  if (transactionsError) {
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
                transaction.transaction_type ===
                  "buy" ||
                transaction.transaction_type ===
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
  // Load live prices for held positions
  // ---------------------------------------------------------

  const marketPrices: Record<
    string,
    number
  > = {};

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
        "Unable to load market prices for Discovery V2 portfolio fit:",
        error
      );
    }
  }

  // ---------------------------------------------------------
  // Calculate current portfolio state
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
  // Load dynamic universe for sector mapping
  // ---------------------------------------------------------

  const dynamicUniverse =
    await getDynamicDiscoveryUniverse();

  const sectorByTicker =
    new Map(
      dynamicUniverse.map(
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
    Record<
      string,
      number
    > = {};

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
  // Run Discovery V2
  // ---------------------------------------------------------

  const result =
    await runDiscoveryV2({
      portfolioTotalValue,

      availableCash,

      holdingsByTicker,

      sectorMarketValues,
    });

  // ---------------------------------------------------------
  // Determine discovery date
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
  // Build persisted Discovery V2 rows
  // ---------------------------------------------------------

  const rows =
    result.candidates.map(
      (candidate) => ({
        user_id:
          user.id,

        portfolio_type:
          portfolioMode,

        ticker:
          candidate.ticker,

        discovery_date:
          discoveryDate,

        quality_score:
          candidate.deepScore
            .components
            .quality,

        growth_score:
          candidate.deepScore
            .components
            .growth,

        valuation_score:
          candidate.deepScore
            .components
            .valuation,

        /*
          V2 no longer uses these legacy
          components. Leave them explicitly
          at zero rather than disguising a
          different metric under the old
          column names.
        */

        earnings_score:
          0,

        risk_score:
          0,

        trend_quality_score:
          candidate.deepScore
            .components
            .trendQuality,

        capital_discipline_score:
          candidate.deepScore
            .components
            .capitalDiscipline,

        deep_score:
          candidate.deepScore
            .totalScore,

        selector_score:
          candidate.selectorScore,

        portfolio_fit_score:
          candidate.portfolioFitScore,

        total_score:
          candidate.finalScore,

        market_cap_bucket:
          candidate.marketCapBucket,

        sector:
          candidate.sector,

        industry:
          candidate.industry,

        scoring_version:
          "v2",

        reason_summary:
          candidate.deepScore
            .reasonSummary,

        status:
          "new",
      })
    );

  // ---------------------------------------------------------
  // Persist candidates
  // ---------------------------------------------------------

  if (
    rows.length > 0
  ) {
    const {
      error,
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

    if (error) {
      throw new Error(
        `Unable to save Discovery V2 candidates: ${error.message}`
      );
    }
  }

  // ---------------------------------------------------------
  // Return summary
  // ---------------------------------------------------------

  return {
    discoveryDate,

    universeCount:
      dynamicUniverse.length,

    researchedCount:
      result.researchedCount,

    scoredCount:
      result.scoredCount,

    unavailableCount:
      0,

    openAiCalls:
      0,

    savedCount:
      rows.length,

    failures:
      [],

    scoringVersion:
      "v2",

    topCandidates:
      result.candidates.slice(
        0,
        10
      ),
  };
}