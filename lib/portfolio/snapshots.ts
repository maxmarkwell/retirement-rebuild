import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type SnapshotResult = {
  snapshotDate: string;
  count: number;
};

type QuoteRefreshResult = {
  snapshotDate: string;
  heldTickers: string[];
  freshTickers: string[];
  refreshedTickers: string[];
  missingTickers: string[];
};

const SNAPSHOT_PROVIDER_FETCH_LIMIT = 6;
const DENVER_TIME_ZONE = "America/Denver";

// ---------------------------------------------------------
// Snapshot date helpers
// ---------------------------------------------------------

function getDenverDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DENVER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDenverDateFromTimestamp(
  timestamp: string
): string | null {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return getDenverDate(date);
}

// ---------------------------------------------------------
// Determine currently held tickers by portfolio
// ---------------------------------------------------------

async function getHeldTickersForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<string[]> {
  const { data: transactions, error } =
    await supabase
      .from("transactions")
      .select(
        "portfolio_id, transaction_type, ticker, quantity"
      )
      .eq("user_id", userId)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `Unable to load transactions for market quotes: ${error.message}`
    );
  }

  const portfolioShareBalances =
    new Map<string, Map<string, number>>();

  for (const transaction of transactions ?? []) {
    if (
      !transaction.portfolio_id ||
      !transaction.ticker ||
      transaction.quantity == null
    ) {
      continue;
    }

    if (
      transaction.transaction_type !== "buy" &&
      transaction.transaction_type !== "sell"
    ) {
      continue;
    }

    const portfolioId = transaction.portfolio_id;
    const ticker = transaction.ticker
      .trim()
      .toUpperCase();

    if (ticker === "TEST" || ticker === "TEST2") {
      continue;
    }

    const quantity = Number(transaction.quantity);

    let balances =
      portfolioShareBalances.get(portfolioId);

    if (!balances) {
      balances = new Map<string, number>();

      portfolioShareBalances.set(
        portfolioId,
        balances
      );
    }

    const current =
      balances.get(ticker) ?? 0;

    balances.set(
      ticker,
      transaction.transaction_type === "buy"
        ? current + quantity
        : current - quantity
    );
  }

  const heldTickerSet = new Set<string>();

  for (const balances of portfolioShareBalances.values()) {
    for (const [ticker, quantity] of balances.entries()) {
      if (quantity > 0.00000001) {
        heldTickerSet.add(ticker);
      }
    }
  }

  return Array.from(heldTickerSet).sort();
}

// ---------------------------------------------------------
// Refresh persistent snapshot quotes
// ---------------------------------------------------------

export async function refreshSnapshotQuotesForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<QuoteRefreshResult> {
  const snapshotDate = getDenverDate();

  const heldTickers =
    await getHeldTickersForUser(
      userId,
      supabase
    );

  if (heldTickers.length === 0) {
    return {
      snapshotDate,
      heldTickers: [],
      freshTickers: [],
      refreshedTickers: [],
      missingTickers: [],
    };
  }

  const { data: cachedQuotes, error: cachedQuotesError } =
    await supabase
      .from("market_quote_cache")
      .select(
        "ticker, price, previous_close, quote_timestamp, fetched_at"
      )
      .in("ticker", heldTickers);

  if (cachedQuotesError) {
    throw new Error(
      `Unable to load cached market quotes: ${cachedQuotesError.message}`
    );
  }

  const freshTickerSet = new Set<string>();

  for (const cachedQuote of cachedQuotes ?? []) {
    const ticker = cachedQuote.ticker
      .trim()
      .toUpperCase();

    const fetchedDate =
      getDenverDateFromTimestamp(
        cachedQuote.fetched_at
      );

    if (
      fetchedDate === snapshotDate &&
      Number(cachedQuote.price) > 0
    ) {
      freshTickerSet.add(ticker);
    }
  }

  const tickersNeedingRefresh =
    heldTickers.filter(
      (ticker) => !freshTickerSet.has(ticker)
    );

  const tickersToFetch =
    tickersNeedingRefresh.slice(
      0,
      SNAPSHOT_PROVIDER_FETCH_LIMIT
    );

  const refreshedTickers: string[] = [];

  if (tickersToFetch.length > 0) {
    const quotes =
      await getMarketQuotes(tickersToFetch);

    const fetchedAt =
      new Date().toISOString();

    const cacheRows =
      Object.entries(quotes).map(
        ([ticker, quote]) => ({
          ticker,
          price: quote.price,
          previous_close: quote.previousClose,
          quote_timestamp:
            quote.timestamp != null
              ? new Date(
                  quote.timestamp * 1000
                ).toISOString()
              : null,
          fetched_at: fetchedAt,
          provider: "twelve_data",
        })
      );

    if (cacheRows.length > 0) {
      const { error: cacheWriteError } =
        await supabase
          .from("market_quote_cache")
          .upsert(cacheRows, {
            onConflict: "ticker",
          });

      if (cacheWriteError) {
        throw new Error(
          `Unable to persist market quotes: ${cacheWriteError.message}`
        );
      }

      for (const row of cacheRows) {
        freshTickerSet.add(row.ticker);
        refreshedTickers.push(row.ticker);
      }
    }
  }

  const missingTickers =
    heldTickers.filter(
      (ticker) => !freshTickerSet.has(ticker)
    );

  return {
    snapshotDate,
    heldTickers,
    freshTickers:
      Array.from(freshTickerSet).sort(),
    refreshedTickers:
      refreshedTickers.sort(),
    missingTickers,
  };
}

// ---------------------------------------------------------
// Core snapshot engine
// ---------------------------------------------------------

export async function captureDailySnapshotsForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<SnapshotResult> {
  const snapshotDate = getDenverDate();

  // ---------------------------------------------------------
  // Load this user's portfolios
  // ---------------------------------------------------------

  const { data: portfolios, error: portfoliosError } =
    await supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
    );
  }

  if (!portfolios || portfolios.length === 0) {
    throw new Error(
      "No portfolios were found for the snapshot user."
    );
  }

  // ---------------------------------------------------------
  // Load this user's contributions
  // ---------------------------------------------------------

  const {
    data: contributions,
    error: contributionsError,
  } = await supabase
    .from("contributions")
    .select("portfolio_id, amount")
    .eq("user_id", userId);

  if (contributionsError) {
    throw new Error(
      `Unable to load contributions: ${contributionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load this user's transactions
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "portfolio_id, transaction_type, ticker, quantity, gross_amount, fees, transaction_date, created_at"
    )
    .eq("user_id", userId)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (transactionsError) {
    throw new Error(
      `Unable to load transactions: ${transactionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Refresh/load today's market prices
  // ---------------------------------------------------------

  const quoteRefresh =
    await refreshSnapshotQuotesForUser(
      userId,
      supabase
    );

  if (quoteRefresh.missingTickers.length > 0) {
    throw new Error(
      `Snapshot is waiting for market prices for: ${quoteRefresh.missingTickers.join(
        ", "
      )}. No snapshot was written.`
    );
  }

  const marketPrices: Record<string, number> = {};

  if (quoteRefresh.heldTickers.length > 0) {
    const {
      data: cachedQuotes,
      error: cachedQuotesError,
    } = await supabase
      .from("market_quote_cache")
      .select("ticker, price, fetched_at")
      .in(
        "ticker",
        quoteRefresh.heldTickers
      );

    if (cachedQuotesError) {
      throw new Error(
        `Unable to load snapshot market prices: ${cachedQuotesError.message}`
      );
    }

    for (const cachedQuote of cachedQuotes ?? []) {
      const ticker = cachedQuote.ticker
        .trim()
        .toUpperCase();

      const fetchedDate =
        getDenverDateFromTimestamp(
          cachedQuote.fetched_at
        );

      if (
        fetchedDate === snapshotDate &&
        Number(cachedQuote.price) > 0
      ) {
        marketPrices[ticker] =
          Number(cachedQuote.price);
      }
    }
  }

  const missingPrices =
    quoteRefresh.heldTickers.filter(
      (ticker) => marketPrices[ticker] == null
    );

  if (missingPrices.length > 0) {
    throw new Error(
      `Snapshot is missing validated market prices for: ${missingPrices.join(
        ", "
      )}. No snapshot was written.`
    );
  }

  // ---------------------------------------------------------
  // Build snapshot rows
  // ---------------------------------------------------------

  const rows = portfolios.map((portfolio) => {
    const accounting =
      calculatePortfolioAccounting(
        portfolio,
        contributions ?? [],
        transactions ?? [],
        marketPrices
      );

    return {
      user_id: userId,
      portfolio_id: portfolio.id,
      snapshot_date: snapshotDate,
      cash_value: accounting.cash,
      holdings_value: accounting.marketValue,
      total_value: accounting.permanentCapital,
      cumulative_contributions:
        accounting.contributionsTotal,
      cumulative_withdrawals: 0,
      investment_growth:
        accounting.investmentGrowth,
    };
  });

  // ---------------------------------------------------------
  // Upsert one snapshot per portfolio per day
  // ---------------------------------------------------------

  const { error: snapshotError } =
    await supabase
      .from("portfolio_snapshots")
      .upsert(rows, {
        onConflict:
          "portfolio_id,snapshot_date",
      });

  if (snapshotError) {
    throw new Error(
      `Unable to save portfolio snapshots: ${snapshotError.message}`
    );
  }

  return {
    snapshotDate,
    count: rows.length,
  };
}

// ---------------------------------------------------------
// Manual authenticated snapshot wrapper
// ---------------------------------------------------------

export async function captureDailySnapshots(): Promise<SnapshotResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const adminSupabase =
    createAdminClient();

  return captureDailySnapshotsForUser(
    user.id,
    adminSupabase
  );
}