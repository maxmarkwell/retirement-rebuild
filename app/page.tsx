import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import TransactionHistory from "@/components/transaction-history";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";
import { calculateInvestmentOverview } from "@/lib/portfolio/investment-overview";
import BuyForm from "@/components/buy-form";
import SellForm from "@/components/sell-form";
import ContributionForm from "@/components/contribution-form";
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
    (portfolios ?? []).map((portfolio) => portfolio.id)
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

  // Dashboard reads persistent quote cache. Page views must not consume
  // provider credits needed by the daily portfolio snapshot cron.
  const marketPrices: Record<string, number> = {};
  const quoteFetchedAt: Record<string, string> = {};
  if (heldTickers.length > 0) {
    // Quote cache has no authenticated SELECT policy; server-only service role reads it.
    // Never expose the service-role key or use this client for user-owned portfolio rows.
    const { data: cachedQuotes, error: quoteError } = await createAdminClient()
      .from("market_quote_cache")
      .select("ticker, price, fetched_at")
      .in("ticker", heldTickers);
    if (quoteError) {
      console.error("Unable to read cached dashboard prices:", quoteError);
    } else {
      for (const quote of cachedQuotes ?? []) {
        if (Number(quote.price) > 0) {
          const ticker = quote.ticker.trim().toUpperCase();
          marketPrices[ticker] = Number(quote.price);
          quoteFetchedAt[ticker] = quote.fetched_at;
        }
      }
    }
  }

  let agOperationalState: Awaited<ReturnType<typeof getAgOperationalState>> | null = null;
  try {
    agOperationalState = await getAgOperationalState();
  } catch (error) {
    console.error("Unable to load Accelerated Growth operational state:", error);
  }

  // Current accounting source for account-level cash and equity; do not double count strategy-specific virtual allocations.
  const realPortfolio = (portfolios ?? []).find(p => p.type === "real" && p.is_real_money === true);
  const realAccounting = realPortfolio
    ? calculatePortfolioAccounting(realPortfolio, contributions ?? [], transactions ?? [], marketPrices)
    : null;
  const agPortfolio = (portfolios ?? []).find(p => p.type === "paper_active" && agEraByPortfolioId.has(p.id));
  const agEra = agPortfolio ? agEraByPortfolioId.get(agPortfolio.id) : undefined;
  const agAccounting = agPortfolio && agEra
    ? calculatePortfolioAccounting(agPortfolio, contributions ?? [], transactions ?? [], marketPrices,
        { inception_at: agEra.inception_at, reference_total_capital: agEra.reference_total_capital })
    : null;
  const realMissingQuotes = realAccounting?.holdings.some(h => h.marketPrice == null) ?? true;
  const agMissingQuotes = agAccounting?.holdings.some(h => h.marketPrice == null) ?? true;
  const investmentOverview = realAccounting && agAccounting && realPortfolio
    ? calculateInvestmentOverview({
        realGrowth: realAccounting.investmentGrowth,
        agPaperGrowth: agAccounting.investmentGrowth,
        realCash: realAccounting.cash,
        realEquity: realAccounting.permanentCapital,
        contributedCapital: Number(realPortfolio.starting_capital) + realAccounting.contributionsTotal,
        agReferenceCapital: Number(agEra?.reference_total_capital ?? agPortfolio?.starting_capital ?? 0) + agAccounting.contributionsTotal,
        realQuotesComplete: !realMissingQuotes,
        agQuotesComplete: !agMissingQuotes,
      })
    : null;
  const showMoney = (v: number | null) => v == null ? "Unavailable" : `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v).toFixed(2)}`;
  const showPercent = (v: number | null) => v == null ? "N/A" : `${v < -0.000001 ? "−" : v > 0.000001 ? "+" : ""}${Math.abs(v).toFixed(2)}%`;
  const dashboardQuotes = [...(realAccounting?.holdings ?? []), ...(agAccounting?.holdings ?? [])]
    .map(h => quoteFetchedAt[h.ticker]).filter((value): value is string => Boolean(value));
  const latestPriceDate = dashboardQuotes.length
    ? new Date(Math.min(...dashboardQuotes.map(value => Date.parse(value))))
    : null;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-7 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">INVESTMENT COMMAND CENTER</p>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Mission Control</h1>
          <p className="mt-2 text-gray-600">Your capital, performance, and strategy at a glance.</p>
        </div>

        {investmentOverview && (
          <section aria-label="All investments overview" className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-800">All investments</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Combined Investment Overview</h2>
                <p className="mt-1 text-sm text-gray-500">Performance across Long-Term and Accelerated Growth.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Since inception</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-600">Long-Term gain/loss</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{showMoney(investmentOverview.realGain)}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-700">{showPercent(investmentOverview.realReturnPct)} of Long-Term capital</p>
                <p className="mt-1 text-xs text-gray-500">Actual holdings and realized results</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-600">Accelerated Growth gain/loss</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{showMoney(investmentOverview.paperGain)}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-700">{showPercent(investmentOverview.agReturnPct)} of AG reference capital</p>
                <p className="mt-1 text-xs text-gray-500">Accelerated Growth performance</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-600">Combined strategy gain/loss</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{showMoney(investmentOverview.combinedStrategyGain)}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-700">{showPercent(investmentOverview.combinedChangePct)} relative to shared capital</p>
                <p className="mt-1 text-xs text-gray-500">Sum of strategy gains and losses</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-gray-600">Investment account value</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">${investmentOverview.realEquity.toFixed(2)}</p>
                <p className="mt-1 text-xs text-gray-500">Available real cash: ${investmentOverview.realCash.toFixed(2)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-500">Returns exclude contributions. Account value and available cash are shown once, without double-counting capital across strategies.
              {latestPriceDate && Number.isFinite(latestPriceDate.getTime()) ? ` Oldest holding quote: ${latestPriceDate.toLocaleDateString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric" })}.` : " No open-position quote dates available."}
            </p>
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {portfolios?.filter((portfolio) => portfolio.type !== "paper_long_term").map((portfolio) => {
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
            const capitalBase = Number(agEra?.reference_total_capital ?? portfolio.starting_capital) + accounting.contributionsTotal;
            // AG sleeve equity ($40 risk allocation) is not the $200 total strategy equity.
            const currentEquity = accounting.permanentCapital;
            const gainLoss = currentEquity - capitalBase;
            const gainLossPct = capitalBase > 0 ? 100 * gainLoss / capitalBase : null;
            const missingQuotes = activeHoldings.some((holding) => holding.marketPrice == null);
            const staleQuotes = activeHoldings.some((holding) => {
              const fetched = quoteFetchedAt[holding.ticker];
              return !fetched || !Number.isFinite(Date.parse(fetched)) || Date.now() - Date.parse(fetched) > 36 * 60 * 60 * 1000;
            });
            const unavailable = missingQuotes;
            const quoteDates = activeHoldings.map((holding) => quoteFetchedAt[holding.ticker]).filter((date): date is string => Boolean(date));
            const oldestQuoteDate = quoteDates.length ? new Date(Math.min(...quoteDates.map((date) => Date.parse(date)))) : null;
            const quoteAsOf = oldestQuoteDate && Number.isFinite(oldestQuoteDate.getTime())
              ? oldestQuoteDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" })
              : null;
            const direction = Math.abs(gainLoss) < 0.005 ? "even" : gainLoss > 0 ? "up" : "down";
            const statusStyle = unavailable ? "border-amber-200 bg-amber-50 text-amber-800" : direction === "up" ? "border-green-200 bg-green-50 text-green-800" : direction === "down" ? "border-red-200 bg-red-50 text-red-800" : "border-gray-200 bg-gray-50 text-gray-700";

            return (
              <div key={portfolio.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{agState ? "Strategy portfolio" : portfolio.type === "real" ? "Real-money portfolio" : portfolio.type === "benchmark" ? "Benchmark portfolio" : portfolio.type.replaceAll("_", " ")}</p>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {agEra?.strategy_key === "accelerated_growth" ? "Accelerated Growth" : portfolio.name}
                  </h2>
                  <Link href={`/portfolios/${portfolio.id}`} className="text-xs font-semibold text-cyan-800 underline underline-offset-2">Open workspace →</Link>
                </div>

                <p className="mt-6 text-3xl font-bold text-gray-900">
                  ${accounting.permanentCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-sm text-gray-500">{agEra ? "Total AG Strategy Equity" : "Permanent Capital"}</p>
                <div className={`mt-4 rounded-lg border px-4 py-3 ${statusStyle}`} aria-label="Portfolio gain or loss">
                  {unavailable ? <p className="text-sm font-semibold">{missingQuotes ? "Gain/loss unavailable — missing market quotes" : "Gain/loss unavailable — market quotes are stale"}</p> : <>
                    <p className="text-xs font-semibold uppercase tracking-wide">{direction === "up" ? "▲ Up" : direction === "down" ? "▼ Down" : "● Even"} since inception</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">
                      {gainLoss > 0.005 ? "+" : gainLoss < -0.005 ? "−" : ""}${Math.abs(gainLoss).toFixed(2)}
                      <span className="ml-2 text-base">({gainLossPct == null ? "N/A" : `${gainLossPct > 0.005 ? "+" : gainLossPct < -0.005 ? "−" : ""}${Math.abs(gainLossPct).toFixed(2)}%`})</span>
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      Investment return excluding contributions
                      {quoteAsOf ? ` · Prices as of ${quoteAsOf}${staleQuotes ? " (older quotes)" : ""}` : " · No open positions"}
                    </p>
                  </>}
                </div>

                <details className="mt-5 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-cyan-800">Portfolio breakdown</summary><div className="mt-4 space-y-2">
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
                </div></details>

                {!agState && activeHoldings.length > 0 && (
                  <details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-semibold text-cyan-800">Holdings ({activeHoldings.length})</summary>
                    <div className="mt-4 max-h-80 space-y-4 overflow-y-auto pr-2">
                      {activeHoldings.map((holding) => (
                        <div key={holding.ticker}>
                          <div className="flex justify-between text-sm"><span className="font-semibold text-gray-900">{holding.ticker}</span><span className="text-gray-700">{holding.quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })} shares</span></div>
                          <div className="mt-1 flex justify-between text-xs text-gray-500"><span>Average Cost</span><span>${holding.averageCost.toFixed(2)}</span></div>
                          <div className="flex justify-between text-xs text-gray-500"><span>Market Price{holding.marketPrice != null && <span className="ml-1 text-green-700">• Cached</span>}</span><span>{holding.marketPrice != null ? `$${holding.marketPrice.toFixed(2)}` : "—"}</span></div>
                          <div className="flex justify-between text-xs text-gray-500"><span>Market Value</span><span>${holding.marketValue.toFixed(2)}</span></div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Operations</h2>
          <p className="mt-1 text-sm text-slate-500">Record activity when needed. Trades remain manually executed.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold text-cyan-800">Record buy</summary><div className="mt-4"><BuyForm portfolios={(portfolios ?? []).filter((p) => p.type !== "paper_long_term")} /></div></details>
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold text-cyan-800">Record sell</summary><div className="mt-4"><SellForm portfolios={(portfolios ?? []).filter((p) => p.type !== "paper_long_term")} /></div></details>
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold text-cyan-800">Add contribution</summary><div className="mt-4"><ContributionForm portfolios={(portfolios ?? []).filter((p) => p.type !== "paper_long_term")} /></div></details>
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold text-cyan-800">Manual performance snapshot</summary><div className="mt-4"><SnapshotButton /></div></details>
          </div>
        </section>
        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold text-slate-900">Transaction history</summary>
          <div className="mt-5"><TransactionHistory transactions={transactions ?? []} portfolios={(portfolios ?? []).filter((p) => p.type !== "paper_long_term")} /></div>
        </details>
      </div>
    </main>
  );
}
