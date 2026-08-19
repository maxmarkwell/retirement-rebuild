import { createClient } from "@/lib/supabase/server";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";

export async function captureDailySnapshots() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  // ---------------------------------------------------------
  // Load portfolios
  // ---------------------------------------------------------

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load contributions
  // ---------------------------------------------------------

  const { data: contributions, error: contributionsError } = await supabase
    .from("contributions")
    .select("portfolio_id, amount");

  if (contributionsError) {
    throw new Error(
      `Unable to load contributions: ${contributionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load transactions
  // ---------------------------------------------------------

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select(
      "portfolio_id, transaction_type, ticker, quantity, gross_amount, fees, transaction_date, created_at"
    )
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

    const ticker =
      transaction.ticker.toUpperCase();

    const quantity =
      Number(transaction.quantity);

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

  try {
    const quotes =
      await getMarketQuotes(heldTickers);

    for (const [ticker, quote] of Object.entries(quotes)) {
      marketPrices[ticker] =
        quote.price;
    }
  } catch (error) {
    console.error(
      "Unable to load market quotes for snapshots:",
      error
    );
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

  const rows = (portfolios ?? []).map((portfolio) => {
    const accounting =
      calculatePortfolioAccounting(
        portfolio,
        contributions ?? [],
        transactions ?? [],
        marketPrices
      );

    return {
      user_id: user.id,
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

  const { error: snapshotError } = await supabase
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