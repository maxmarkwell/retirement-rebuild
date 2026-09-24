import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TransactionHistory from "@/components/transaction-history";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import BuyForm from "@/components/buy-form";
import SellForm from "@/components/sell-form";
import ContributionForm from "@/components/contribution-form";
import { getMarketQuotes } from "@/lib/market-data/twelve-data";
import SnapshotButton from "@/components/snapshot-button";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(`Unable to load portfolios: ${portfoliosError.message}`);
  }

  const { data: strategyEras, error: strategyErasError } = await supabase
    .from("portfolio_strategy_eras")
    .select("portfolio_id, strategy_key, inception_at, reference_total_capital, execution_mode, ended_at")
    .eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper")
    .is("ended_at", null);

  if (strategyErasError) {
    throw new Error(`Unable to load Accelerated Growth strategy eras: ${strategyErasError.message}`);
  }

  const agEraByPortfolioId = new Map((strategyEras ?? []).map((era) => [era.portfolio_id, era]));

  const { data: contributions, error: contributionsError } = await supabase
    .from("contributions")
    .select("portfolio_id, amount, created_at");

  if (contributionsError) {
    throw new Error(`Unable to load contributions: ${contributionsError.message}`);
  }

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id, portfolio_id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees, transaction_date, created_at")
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (transactionsError) {
    throw new Error(`Unable to load transactions: ${transactionsError.message}`);
  }

  const realPortfolioIds = new Set(
    (portfolios ?? []).filter((portfolio) => portfolio.is_real_money).map((portfolio) => portfolio.id)
  );
  const shareBalances = new Map<string, number>();

  for (const transaction of transactions ?? []) {
    if (!realPortfolioIds.has(transaction.portfolio_id) || !transaction.ticker || transaction.quantity == null) continue;
    if (transaction.transaction_type !== "buy" && transaction.transaction_type !== "sell") continue;
    const ticker = transaction.ticker.toUpperCase();
    const quantity = Number(transaction.quantity);
    const current = shareBalances.get(ticker) ?? 0;
    shareBalances.set(ticker, transaction.transaction_type === "buy" ? current + quantity : current - quantity);
  }

  const heldTickers = Array.from(shareBalances.entries())
    .filter(([ticker, quantity]) => quantity > 0.00000001 && ticker !== "TEST" && ticker !== "TEST2")
    .map(([ticker]) => ticker);

  const marketPrices: Record<string, number> = {};
  try {
    const quotes = await getMarketQuotes(heldTickers);
    for (const [ticker, quote] of Object.entries(quotes)) marketPrices[ticker] = quote.price;
  } catch (error) {
    console.error("Unable to load market quotes:", error);
  }

  let agOperationalState: Awaited<ReturnType<typeof getAgOperationalState>> | null = null;
  try {
    agOperationalState = await getAgOperationalState();
  } catch (error) {
    console.error("Unable to load Accelerated Growth operational state:", error);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">RETIREMENT REBUILD</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Portfolio Dashboard</h1>
          <p className="mt-2 text-gray-600">Build permanent capital. Measure what works.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {portfolios?.map((portfolio) => {
            const agEra = portfolio.type === "paper_active" ? agEraByPortfolioId.get(portfolio.id) : undefined;
            const accounting = calculatePortfolioAccounting(
              portfolio,
              contributions ?? [],
              transactions ?? [],
              marketPrices,
              agEra ? { inception_at: agEra.inception_at, reference_total_capital: agEra.reference_total_capital } : undefined
            );
            const activeHoldings = accounting.holdings;
            const agState = agOperationalState?.portfolioId === portfolio.id ? agOperationalState : null;

            return (
              <div key={portfolio.id} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-gray-500">{agState ? "paper strategy" : portfolio.type.replaceAll("_", " ")}</p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {agEra?.strategy_key === "accelerated_growth" ? "Accelerated Growth" : portfolio.name}
                  </h2>
                  {agState && <Link href="/accelerated-growth" className="text-xs font-semibold text-gray-600 underline underline-offset-2">Open</Link>}
                </div>

                <p className="mt-6 text-3xl font-bold text-gray-900">
                  ${(agState ? agState.valuation.currentEquity : accounting.permanentCapital).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-sm text-gray-500">{agState ? "AG Sleeve Equity" : "Permanent Capital"}</p>

                <div className="mt-6 space-y-2 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">{agState || agEra ? "Reference Capital" : "Starting Capital"}</span>
                    <span className="font-medium text-gray-900">${Number(agState?.accounting.referenceTotalCapital ?? agEra?.reference_total_capital ?? portfolio.starting_capital).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>

                  {!agState && <>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Contributions</span><span className="font-medium text-gray-900">${accounting.contributionsTotal.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Cash</span><span className="font-medium text-gray-900">${accounting.cash.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Holdings at Cost</span><span className="font-medium text-gray-900">${accounting.holdingsAtCost.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Market Value</span><span className="font-medium text-gray-900">${accounting.marketValue.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Unrealized Gain/Loss</span><span className="font-medium text-gray-900">${accounting.unrealizedGainLoss.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Realized Gain/Loss</span><span className="font-medium text-gray-900">${accounting.realizedGainLoss.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Investment Growth</span><span className="font-medium text-gray-900">${accounting.investmentGrowth.toFixed(2)}</span></div>
                  </>}

                  {agState && <>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Risk Sleeve</span><span className="font-medium text-gray-900">${agState.accounting.sleeveCap.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Available Cash</span><span className="font-medium text-gray-900">${agState.accounting.sleeveCash.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Holdings at Cost</span><span className="font-medium text-gray-900">${agState.accounting.eraNetDeployed.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Market Value</span><span className="font-medium text-gray-900">${agState.valuation.holdingsMarketValue.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-gray-500">Drawdown</span><span className="font-medium text-gray-900">{(agState.valuation.drawdownPct * 100).toFixed(2)}%</span></div>
                    <div className="mt-4 rounded-md bg-gray-50 p-3">
                      <div className="flex justify-between text-xs"><span className="text-gray-500">Positions</span><span className="font-semibold text-gray-900">{agState.holdings.length}</span></div>
                      <div className="mt-1 flex justify-between text-xs"><span className="text-gray-500">Research Watches</span><span className="font-semibold text-gray-900">{agState.researchWatchlist.length}</span></div>
                      <div className="mt-1 flex justify-between text-xs"><span className="text-gray-500">Active Committee</span><span className="font-semibold text-gray-900">{agState.activeDecisions.length}</span></div>
                    </div>
                    <Link href="/accelerated-growth" className="mt-4 block rounded-md border border-gray-200 bg-white px-3 py-2 text-center text-xs font-semibold text-gray-700">Open AG Operations</Link>
                  </>}
                </div>

                {!agState && activeHoldings.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Holdings</p>
                    <div className="space-y-4">
                      {activeHoldings.map((holding) => (
                        <div key={holding.ticker}>
                          <div className="flex justify-between text-sm"><span className="font-semibold text-gray-900">{holding.ticker}</span><span className="text-gray-700">{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} shares</span></div>
                          <div className="mt-1 flex justify-between text-xs text-gray-500"><span>Average Cost</span><span>${holding.averageCost.toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs text-gray-500"><span>Market Price{holding.marketPrice != null && <span className="ml-1 text-green-700">• Live</span>}</span><span>{holding.marketPrice != null ? `$${holding.marketPrice.toFixed(2)}` : "—"}</span></div>
                          <div className="flex justify-between text-xs text-gray-500"><span>Market Value</span><span>${holding.marketValue.toFixed(2)}</span></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-gray-900">Buy Shares</h2><BuyForm portfolios={portfolios ?? []} /></div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-gray-900">Sell Shares</h2><SellForm portfolios={portfolios ?? []} /></div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-gray-900">Add Contribution</h2><ContributionForm portfolios={portfolios ?? []} /></div>
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-gray-900">Performance Snapshot</h2><SnapshotButton /></div>
        </div>

        <div className="mt-10"><TransactionHistory transactions={transactions ?? []} /></div>
      </div>
    </main>
  );
}
