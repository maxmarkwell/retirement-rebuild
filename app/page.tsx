import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionHistory from "@/components/transaction-history";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import BuyForm from "@/components/buy-form";
import SellForm from "@/components/sell-form";
import ContributionForm from "@/components/contribution-form";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
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
  // Load transactions in chronological order
  // ---------------------------------------------------------

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select(
      "id, portfolio_id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees, transaction_date, created_at"
    )
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (transactionsError) {
    throw new Error(
      `Unable to load transactions: ${transactionsError.message}`
    );
  }

// ---------------------------------------------------------
// Determine which real tickers are currently held
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
// Load current market quotes in one batch
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
    "Unable to load market quotes:",
    error
  );
}
  // ---------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Portfolio Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            Build permanent capital. Measure what works.
          </p>
        </div>

        {/* Portfolio Cards */}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {portfolios?.map((portfolio) => {
            const accounting = calculatePortfolioAccounting(
              portfolio,
              contributions ?? [],
              transactions ?? [],
              marketPrices
            );

            const activeHoldings = accounting.holdings;

            return (
              <div
                key={portfolio.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <p className="text-sm text-gray-500">
                  {portfolio.type}
                </p>

                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {portfolio.name}
                </h2>

                <p className="mt-6 text-3xl font-bold text-gray-900">
                  $
                  {accounting.permanentCapital.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Permanent Capital
                </p>

                <div className="mt-6 space-y-2 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Starting Capital
                    </span>

                    <span className="font-medium text-gray-900">
                      $
                      {Number(
                        portfolio.starting_capital
                      ).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Contributions
                    </span>

                    <span className="font-medium text-gray-900">
                      $
                      {accounting.contributionsTotal.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Cash
                    </span>

                    <span className="font-medium text-gray-900">
                      $
                      {accounting.cash.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Holdings at Cost
                    </span>

                    <span className="font-medium text-gray-900">
                      $
                      {accounting.holdingsAtCost.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Market Value
                    </span>

                    <span className="font-medium text-gray-900">
                      $
                      {accounting.marketValue.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Unrealized Gain/Loss
                    </span>

                    <span
                      className={`font-medium ${
                        accounting.unrealizedGainLoss > 0
                          ? "text-green-700"
                          : accounting.unrealizedGainLoss < 0
                            ? "text-red-700"
                            : "text-gray-900"
                      }`}
                    >
                      $
                      {accounting.unrealizedGainLoss.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Realized Gain/Loss
                    </span>

                    <span
                      className={`font-medium ${
                        accounting.realizedGainLoss > 0
                          ? "text-green-700"
                          : accounting.realizedGainLoss < 0
                            ? "text-red-700"
                            : "text-gray-900"
                      }`}
                    >
                      $
                      {accounting.realizedGainLoss.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      Investment Growth
                    </span>

                    <span
                      className={`font-medium ${
                        accounting.investmentGrowth > 0
                          ? "text-green-700"
                          : accounting.investmentGrowth < 0
                            ? "text-red-700"
                            : "text-gray-900"
                      }`}
                    >
                      $
                      {accounting.investmentGrowth.toLocaleString(
                        "en-US",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      )}
                    </span>
                  </div>

                  {activeHoldings.length > 0 && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Holdings
                      </p>

                      <div className="space-y-4">
                        {activeHoldings.map((holding) => (
                          <div key={holding.ticker}>
                            <div className="flex justify-between text-sm">
                              <span className="font-semibold text-gray-900">
                                {holding.ticker}
                              </span>

                              <span className="text-gray-700">
                                {holding.quantity.toLocaleString(
                                  "en-US",
                                  {
                                    maximumFractionDigits: 8,
                                  }
                                )}{" "}
                                shares
                              </span>
                            </div>

                            <div className="mt-1 flex justify-between text-xs text-gray-500">
                              <span>Average Cost</span>

                              <span>
                                $
                                {holding.averageCost.toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                              <span>
  Market Price
  {holding.marketPrice != null && (
    <span className="ml-1 text-green-700">
      • Live
    </span>
  )}
</span>

                              <span>
                                {holding.marketPrice != null
                                  ? `$${holding.marketPrice.toLocaleString(
                                      "en-US",
                                      {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      }
                                    )}`
                                  : "Cost basis fallback"}
                              </span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Market Value</span>

                              <span>
                                $
                                {holding.marketValue.toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Unrealized Gain/Loss</span>

                              <span
                                className={
                                  holding.unrealizedGainLoss > 0
                                    ? "text-green-700"
                                    : holding.unrealizedGainLoss < 0
                                      ? "text-red-700"
                                      : ""
                                }
                              >
                                $
                                {holding.unrealizedGainLoss.toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Remaining Cost</span>

                              <span>
                                $
                                {holding.totalCost.toLocaleString(
                                  "en-US",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  }
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 text-sm text-gray-600">
                    {portfolio.is_real_money
                      ? "Real Money"
                      : "Virtual Portfolio"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ContributionForm portfolios={portfolios ?? []} />

        <BuyForm portfolios={portfolios ?? []} />

        <SellForm portfolios={portfolios ?? []} />

        <TransactionHistory
          transactions={transactions ?? []}
          portfolios={portfolios ?? []}
        />
      </div>
    </main>
  );
}