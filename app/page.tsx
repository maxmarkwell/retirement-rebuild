import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransactionHistory from "@/components/transaction-history";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import {
  addBuyTransaction,
  addContribution,
  addSellTransaction,
} from "./actions";

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
              transactions ?? []
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

        {/* Contribution Form */}

        <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Record Contribution
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Test contributions only for now. No real brokerage funding yet.
          </p>

          <form
            action={addContribution}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            <div>
              <label
                htmlFor="portfolio_id"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Portfolio
              </label>

              <select
                id="portfolio_id"
                name="portfolio_id"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">
                  Select a portfolio
                </option>

                {portfolios?.map((portfolio) => (
                  <option
                    key={portfolio.id}
                    value={portfolio.id}
                  >
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="amount"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Amount
              </label>

              <input
                id="amount"
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                placeholder="200.00"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="contribution_date"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Contribution Date
              </label>

              <input
                id="contribution_date"
                name="contribution_date"
                type="date"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="contribution_notes"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Notes
              </label>

              <input
                id="contribution_notes"
                name="notes"
                type="text"
                placeholder="Test contribution"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded bg-black px-5 py-2 text-white"
              >
                Record Contribution
              </button>
            </div>
          </form>
        </div>

        {/* Buy Transaction Form */}

        <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Record Test Buy
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Paper/test transaction only. This does not execute a brokerage
            trade.
          </p>

          <form
            action={addBuyTransaction}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            <div>
              <label
                htmlFor="buy_portfolio_id"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Portfolio
              </label>

              <select
                id="buy_portfolio_id"
                name="portfolio_id"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">
                  Select a portfolio
                </option>

                {portfolios?.map((portfolio) => (
                  <option
                    key={portfolio.id}
                    value={portfolio.id}
                  >
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="buy_ticker"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Ticker
              </label>

              <input
                id="buy_ticker"
                name="ticker"
                type="text"
                required
                placeholder="MSFT"
                className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
              />
            </div>

            <div>
              <label
                htmlFor="buy_quantity"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Quantity
              </label>

              <input
                id="buy_quantity"
                name="quantity"
                type="number"
                min="0.00000001"
                step="0.00000001"
                required
                placeholder="1"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="buy_price_per_share"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Price Per Share
              </label>

              <input
                id="buy_price_per_share"
                name="price_per_share"
                type="number"
                min="0.00000001"
                step="0.00000001"
                required
                placeholder="50.00"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="buy_fees"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Fees
              </label>

              <input
                id="buy_fees"
                name="fees"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="buy_transaction_date"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Transaction Date
              </label>

              <input
                id="buy_transaction_date"
                name="transaction_date"
                type="datetime-local"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="buy_notes"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Notes
              </label>

              <input
                id="buy_notes"
                name="notes"
                type="text"
                placeholder="Test purchase"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded bg-black px-5 py-2 text-white"
              >
                Record Test Buy
              </button>
            </div>
          </form>
        </div>

        {/* Sell Transaction Form */}

        <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Record Test Sell
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Paper/test transaction only. You cannot sell more shares than
            the portfolio owns.
          </p>

          <form
            action={addSellTransaction}
            className="mt-6 grid gap-4 md:grid-cols-2"
          >
            <div>
              <label
                htmlFor="sell_portfolio_id"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Portfolio
              </label>

              <select
                id="sell_portfolio_id"
                name="portfolio_id"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              >
                <option value="">
                  Select a portfolio
                </option>

                {portfolios?.map((portfolio) => (
                  <option
                    key={portfolio.id}
                    value={portfolio.id}
                  >
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="sell_ticker"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Ticker
              </label>

              <input
                id="sell_ticker"
                name="ticker"
                type="text"
                required
                placeholder="TEST"
                className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
              />
            </div>

            <div>
              <label
                htmlFor="sell_quantity"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Quantity
              </label>

              <input
                id="sell_quantity"
                name="quantity"
                type="number"
                min="0.00000001"
                step="0.00000001"
                required
                placeholder="0.5"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="sell_price_per_share"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Sale Price Per Share
              </label>

              <input
                id="sell_price_per_share"
                name="price_per_share"
                type="number"
                min="0.00000001"
                step="0.00000001"
                required
                placeholder="70.00"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="sell_fees"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Fees
              </label>

              <input
                id="sell_fees"
                name="fees"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div>
              <label
                htmlFor="sell_transaction_date"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Transaction Date
              </label>

              <input
                id="sell_transaction_date"
                name="transaction_date"
                type="datetime-local"
                required
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="sell_notes"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Notes
              </label>

              <input
                id="sell_notes"
                name="notes"
                type="text"
                placeholder="First sale test"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded bg-black px-5 py-2 text-white"
              >
                Record Test Sell
              </button>
            </div>
          </form>
        </div>

        <TransactionHistory
          transactions={transactions ?? []}
          portfolios={portfolios ?? []}
        />
      </div>
    </main>
  );
}