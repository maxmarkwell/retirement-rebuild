import { createClient } from "@/lib/supabase/server";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type SnapshotResult = {
  snapshotDate: string;
  count: number;
};

// ---------------------------------------------------------
// Core snapshot engine
// ---------------------------------------------------------

export async function captureDailySnapshotsForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<SnapshotResult> {
  // ---------------------------------------------------------
  // Load this user's portfolios
  // ---------------------------------------------------------

  const { data: portfolios, error: portfoliosError } = await supabase
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
    throw new Error("No portfolios were found for the snapshot user.");
  }

  // ---------------------------------------------------------
  // Load this user's contributions
  // ---------------------------------------------------------

  const { data: contributions, error: contributionsError } =
    await supabase
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

  const { data: transactions, error: transactionsError } =
    await supabase
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
  // Determine currently held real tickers
  // ---------------------------------------------------------

  const shareBalances = new Map<string, number>();

  for (const transaction of transactions ?? []) {
    if (
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

    const ticker = transaction.ticker
      .trim()
      .toUpperCase();

    const quantity = Number(transaction.quantity);

    const current =
      shareBalances.get(ticker) ?? 0;

    if (transaction.transaction_type === "buy") {
      shareBalances.set(
        ticker,
        current + quantity
      );
    }

    if (transaction.transaction_type === "sell") {
      shareBalances.set(
        ticker,
        current - quantity
      );
    }
  }

  const heldTickers = Array.from(
    shareBalances.entries()
  )
    .filter(
      ([ticker, quantity]) =>
        quantity > 0.00000001 &&
        ticker !== "TEST" &&
        ticker !== "TEST2"
    )
    .map(([ticker]) => ticker);

  // ---------------------------------------------------------
  // Load market prices
  // ---------------------------------------------------------

  const marketPrices: Record<string, number> = {};

  if (heldTickers.length > 0) {
    const quotes =
      await getMarketQuotes(heldTickers);

    const missingTickers =
      heldTickers.filter(
        (ticker) => !quotes[ticker]
      );

    if (missingTickers.length > 0) {
      throw new Error(
        `Snapshot cancelled because market quotes were unavailable for: ${missingTickers.join(
          ", "
        )}.`
      );
    }

    for (const [ticker, quote] of Object.entries(quotes)) {
      marketPrices[ticker] = quote.price;
    }
  }

  // ---------------------------------------------------------
  // Use Denver date for daily snapshot identity
  // ---------------------------------------------------------

  const snapshotDate =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Denver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

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
        onConflict: "portfolio_id,snapshot_date",
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

  return captureDailySnapshotsForUser(
    user.id,
    supabase
  );
}