import PerformanceChart from "@/components/performance-chart";
import HoldingsExplorer from "@/components/holdings-explorer";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; activityPage?: string; activityType?: string; activitySearch?: string }> };
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function PortfolioWorkspace({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab = "overview", activityPage = "1", activityType = "all", activitySearch = "" } = await searchParams;
  const currentTab = ["overview", "holdings", "performance", "activity"].includes(tab) ? tab : "overview";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (portfolioError) throw new Error(portfolioError.message);
  if (!portfolio || portfolio.type === "paper_long_term") notFound();

  const [{ data: contributions, error: contributionError }, { data: transactions, error: transactionError }, { data: eras, error: eraError }] = await Promise.all([
    supabase.from("contributions").select("portfolio_id, amount, created_at").eq("portfolio_id", id).eq("user_id", user.id),
    supabase.from("transactions").select("id, portfolio_id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees, transaction_date, created_at").eq("portfolio_id", id).eq("user_id", user.id).order("transaction_date", { ascending: false }),
    supabase.from("portfolio_strategy_eras").select("inception_at, reference_total_capital").eq("portfolio_id", id).eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).maybeSingle()
  ]);
  if (contributionError || transactionError || eraError) throw new Error("Unable to load portfolio workspace data.");

  const era = portfolio.type === "paper_active" && eras ? eras : undefined;
  const holdingsWithoutPrices = calculatePortfolioAccounting(portfolio, contributions ?? [], [...(transactions ?? [])].reverse(), {}, era);
  const tickers = holdingsWithoutPrices.holdings.map((h) => h.ticker);
  const prices: Record<string, number> = {};
  const fetched: Record<string, string> = {};
  if (tickers.length) {
    const { data: quotes, error } = await createAdminClient().from("market_quote_cache").select("ticker, price, fetched_at").in("ticker", tickers);
    if (error) console.error("Portfolio workspace quote cache:", error);
    for (const quote of quotes ?? []) {
      if (Number(quote.price) > 0) {
        prices[quote.ticker.toUpperCase()] = Number(quote.price);
        fetched[quote.ticker.toUpperCase()] = quote.fetched_at;
      }
    }
  }
  const accounting = calculatePortfolioAccounting(portfolio, contributions ?? [], [...(transactions ?? [])].reverse(), prices, era);
  const { data: snapshotRows, error: snapshotError } = await supabase.from("portfolio_snapshots")
    .select("snapshot_date, total_value, investment_growth, cumulative_contributions, cumulative_withdrawals")
    .eq("portfolio_id", id).order("snapshot_date", { ascending: true });
  if (snapshotError) throw new Error("Unable to load portfolio performance history.");
  // Exclude historical AI Active snapshots using a different capital base.
  const chartSnapshots = (snapshotRows ?? []).filter((row) =>
    portfolio.type !== "paper_active" || (row.snapshot_date >= "2026-10-14" && (!era || row.snapshot_date >= era.inception_at.slice(0, 10)))
  );
  const chartPoints = chartSnapshots.map((row) => ({ date: row.snapshot_date, totalValue: Number(row.total_value) }));
  const latestSnapshot = chartSnapshots.at(-1);
  const missing = accounting.holdings.some((h) => h.marketPrice == null);
  const base = Number(era?.reference_total_capital ?? portfolio.starting_capital) + accounting.contributionsTotal;
  const gain = accounting.permanentCapital - base;
  const pct = base > 0 ? gain / base * 100 : null;
  const asOf = accounting.holdings.map((h) => fetched[h.ticker]).filter(Boolean).sort()[0];
  const portfolioName = portfolio.type === "paper_active" ? "Accelerated Growth" : portfolio.name;
  const activityQuery = activitySearch.trim().slice(0, 40).toUpperCase();
  const activityKind = ["buy", "sell"].includes(activityType) ? activityType : "all";
  const activityRecords = (transactions ?? []).filter((t) =>
    (activityKind === "all" || t.transaction_type.toLowerCase() === activityKind) &&
    (!activityQuery || (t.ticker ?? "").toUpperCase().includes(activityQuery))
  );
  const activityPages = Math.max(1, Math.ceil(activityRecords.length / 10));
  const activityPageNumber = Math.min(activityPages, Math.max(1, Number.parseInt(activityPage, 10) || 1));
  const visibleActivity = activityRecords.slice((activityPageNumber - 1) * 10, activityPageNumber * 10);
  const activityHref = (page: number) => `/portfolios/${id}?tab=activity&activityPage=${page}&activityType=${activityKind}&activitySearch=${encodeURIComponent(activityQuery)}`;
  const tabs = ["overview", "holdings", "performance", "activity"];

  return <main className="min-h-screen bg-slate-100 px-4 py-7 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <Link href="/" className="text-sm font-semibold text-cyan-800">← Mission Control</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">Portfolio workspace</p><h1 className="mt-1 text-3xl font-bold text-slate-900">{portfolioName}</h1></div>
        {portfolio.type === "paper_active" && <Link href="/accelerated-growth" className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">AG Operations →</Link>}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Portfolio value</p><p className="mt-2 text-2xl font-bold tabular-nums">{money(accounting.permanentCapital)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Investment return</p><p className={`mt-2 text-2xl font-bold tabular-nums ${missing ? "text-amber-700" : gain > 0 ? "text-emerald-700" : gain < 0 ? "text-red-700" : "text-slate-700"}`}>{missing ? "Price unavailable" : `${gain >= 0 ? "+" : "−"}${money(Math.abs(gain))} (${pct == null ? "N/A" : pct.toFixed(2) + "%"})`}</p><p className="mt-1 text-xs text-slate-500">{asOf ? "Oldest price: " + new Date(asOf).toLocaleDateString("en-US", { timeZone: "America/Denver" }) : "No quoted holdings"}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs uppercase tracking-wide text-slate-500">Cash</p><p className="mt-2 text-2xl font-bold tabular-nums">{money(accounting.cash)}</p></div>
      </div>
      <nav className="mt-7 flex gap-2 overflow-x-auto border-b border-slate-300 pb-2" aria-label="Portfolio sections">
        {tabs.map((item) => <Link key={item} href={`/portfolios/${id}?tab=${item}`} aria-current={currentTab === item ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-4 py-3 text-sm font-semibold capitalize ${currentTab === item ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-white"}`}>{item}</Link>)}
      </nav>
      {currentTab === "overview" && <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-6"><h2 className="text-lg font-semibold">Capital allocation</h2><div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-cyan-600" style={{ width: `${Math.min(100, Math.max(0, accounting.permanentCapital > 0 ? accounting.marketValue / accounting.permanentCapital * 100 : 0))}%` }} /></div><p className="mt-4 text-sm text-slate-600">Invested: {money(accounting.marketValue)} · Cash: {money(accounting.cash)}</p></div>
        <div className="rounded-xl bg-white p-6"><h2 className="text-lg font-semibold">Position summary</h2><p className="mt-4 text-3xl font-bold">{accounting.holdings.length}</p><p className="text-sm text-slate-500">Open holdings</p><Link href={`/portfolios/${id}?tab=holdings`} className="mt-4 inline-block text-sm font-semibold text-cyan-800">Explore holdings →</Link></div>
      </section>}
      {currentTab === "holdings" && <HoldingsExplorer holdings={accounting.holdings} />}
      {currentTab === "performance" && <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Portfolio value over time</h2><p className="mt-1 text-sm text-slate-500">Historical daily snapshots, including cash and holdings. Contributions are not investment gains.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{chartPoints.length} snapshots</span>
        </div>
        <div className="mt-6"><PerformanceChart data={chartPoints} /></div>
        {latestSnapshot && <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <div><p className="text-xs uppercase text-slate-500">Latest recorded value</p><p className="mt-1 text-xl font-bold">{money(Number(latestSnapshot.total_value))}</p></div>
          <div><p className="text-xs uppercase text-slate-500">Latest snapshot date</p><p className="mt-1 text-xl font-bold">{latestSnapshot.snapshot_date}</p></div>
        </div>}
        <Link href="/performance" className="mt-6 inline-block text-sm font-semibold text-cyan-800">Compare all portfolios →</Link>
      </section>}
      {currentTab === "activity" && <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Transaction activity</h2>
        <p className="mt-1 text-xs text-slate-500">{activityRecords.length} matching transactions</p>
        <form className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="activity" />
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Ticker
            <input name="activitySearch" defaultValue={activityQuery} placeholder="Search ticker" maxLength={40} className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Type
            <select name="activityType" defaultValue={activityKind} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"><option value="all">All transactions</option><option value="buy">Buys</option><option value="sell">Sells</option></select>
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Apply</button>
          <Link href={`/portfolios/${id}?tab=activity`} className="px-2 py-2 text-sm font-semibold text-cyan-800">Reset</Link>
        </form>
        <div className="mt-4 divide-y divide-slate-100">
          {visibleActivity.map((t) => <details key={t.id} className="py-3">
            <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-slate-50">
              <span><strong className="uppercase text-cyan-800">{t.transaction_type}</strong> <strong className="ml-1">{t.ticker ?? "—"}</strong><span className="mt-1 block text-xs text-slate-500">{t.transaction_date ?? t.created_at?.slice(0, 10) ?? "Date unavailable"}</span></span>
              <span className="text-right"><strong className="block tabular-nums">{money(Number(t.gross_amount ?? 0))}</strong><span className="text-xs text-slate-500">{t.quantity == null ? "—" : Number(t.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 }) + " shares"} ▾</span></span>
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm"><div><span className="text-slate-500">Gross amount</span><strong className="block">{money(Number(t.gross_amount ?? 0))}</strong></div><div><span className="text-slate-500">Fees</span><strong className="block">{money(Number(t.fees ?? 0))}</strong></div></div>
          </details>)}
        </div>
        {!visibleActivity.length && <p className="py-8 text-center text-sm text-slate-500">No transactions match these filters.</p>}
        {activityPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          {activityPageNumber > 1 ? <Link href={activityHref(activityPageNumber - 1)} className="rounded-lg border px-3 py-2">Previous</Link> : <span className="rounded-lg border px-3 py-2 text-slate-400">Previous</span>}
          <span>Page {activityPageNumber} of {activityPages}</span>
          {activityPageNumber < activityPages ? <Link href={activityHref(activityPageNumber + 1)} className="rounded-lg border px-3 py-2">Next</Link> : <span className="rounded-lg border px-3 py-2 text-slate-400">Next</span>}
        </div>}
      </section>}
    </div>
  </main>;
}
