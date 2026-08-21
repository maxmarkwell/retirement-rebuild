import { createClient } from "@/lib/supabase/server";
import { runDiscoveryScan } from "./scanner";
import type { DiscoveryPortfolioMode } from "./types";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";
import { DISCOVERY_UNIVERSE } from "./universe";

export async function runAndPersistDiscoveryScan(
  portfolioMode: DiscoveryPortfolioMode
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
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
  .eq("type", portfolioMode)
  .eq("is_active", true)
  .single();

if (portfolioError || !portfolio) {
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
  .select("portfolio_id, amount")
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

if (heldTickers.length > 0) {
  try {
    const quotes =
      await getMarketQuotes(
        heldTickers
      );

    for (
      const [ticker, quote]
      of Object.entries(
        quotes
      )
    ) {
      marketPrices[ticker] =
        quote.price;
    }
  } catch (error) {
    console.error(
      "Unable to load market prices for discovery portfolio fit:",
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

const sectorByTicker =
  new Map(
    DISCOVERY_UNIVERSE.map(
      (stock) => [
        stock.ticker,
        stock.sector,
      ]
    )
  );

const sectorMarketValues: Record<
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

  sectorMarketValues[sector] =
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
  const result =
  await runDiscoveryScan(
    portfolioMode,
    {
      portfolioTotalValue,
      availableCash,
      holdingsByTicker,
      sectorMarketValues,
    }
  );
  const discoveryDate =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const rows =
    result.candidates.map(
      (candidate) => ({
        user_id:
          user.id,

        portfolio_type:
          candidate.portfolioMode,

        ticker:
          candidate.ticker,

        discovery_date:
          discoveryDate,

        quality_score:
          candidate.scores.quality,

        growth_score:
          candidate.scores.growth,

        valuation_score:
          candidate.scores.valuation,

        earnings_score:
          candidate.scores.earnings,

        risk_score:
          candidate.scores.risk,

        portfolio_fit_score:
          candidate.scores.portfolioFit,

        total_score:
          candidate.totalScore,

        reason_summary:
          candidate.reasonSummary,

        status:
          "new",
      })
    );

  if (rows.length > 0) {
    const { error } =
      await supabase
        .from(
          "stock_discovery_candidates"
        )
        .upsert(rows, {
          onConflict:
            "user_id,portfolio_type,ticker,discovery_date",
        });

    if (error) {
      throw new Error(
        `Unable to save discovery candidates: ${error.message}`
      );
    }
  }

  return {
    discoveryDate,

    universeCount:
      result.universeCount,

    scoredCount:
      result.scoredCount,

    unavailableCount:
      result.unavailableCount,

    openAiCalls:
      result.openAiCalls,

    savedCount:
      rows.length,

    failures:
      result.failures,

    topCandidates:
      result.candidates.slice(
        0,
        10
      ),
  };
}