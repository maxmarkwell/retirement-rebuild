import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePortfolioAccounting } from "@/lib/portfolio/accounting";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };
const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function PortfolioWorkspace({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
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
  const missing = accounting.holdings.some((h) => h.marketPrice == null);
  const base = Number(era?.reference_total_capital ?? portfolio.starting_capital) + accounting.contributionsTotal;
  const gain = accounting.permanentCapital - base;
  const pct = base > 0 ? gain / base * 100 : null;
  const asOf = accounting.holdings.map((h) => fetched[h.ticker]).filter(Boolean).sort()[0];
  const portfolioName = portfolio.type === "paper_active" && era ? "Accelerated Growth" : portfolio.name;
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
      {currentTab === "holdings" && <section className="mt-6 overflow-hidden rounded-xl bg-white"><div className="border-b border-slate-100 p-5"><h2 className="text-lg font-semibold">Open holdings ({accounting.holdings.length})</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Ticker", "Shares", "Avg cost", "Market price", "Value", "Unrealized"].map((h) => <th key={h} className="px-5 py-4">{h}</th>)}</tr></thead><tbody>{accounting.holdings.map((h) => <tr key={h.ticker} className="border-t border-slate-100"><td className="px-5 py-4 font-bold">{h.ticker}</td><td className="px-5 py-4 tabular-nums">{h.quantity.toFixed(3)}</td><td className="px-5 py-4">{money(h.averageCost)}</td><td className="px-5 py-4">{h.marketPrice == null ? "Unavailable" : money(h.marketPrice)}</td><td className="px-5 py-4">{h.marketPrice == null ? "—" : money(h.marketValue)}</td><td className={`px-5 py-4 ${h.unrealizedGainLoss < 0 ? "text-red-700" : "text-emerald-700"}`}>{h.marketPrice == null ? "—" : money(h.unrealizedGainLoss)}</td></tr>)}</tbody></table></div></section>}
      {currentTab === "performance" && <section className="mt-6 rounded-xl bg-white p-6"><h2 className="text-lg font-semibold">Performance analysis</h2><p className="mt-2 text-sm text-slate-600">Portfolio-level historical performance and benchmark comparison are available in the existing performance workspace.</p><Link href="/performance" className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Open performance →</Link></section>}
      {currentTab === "activity" && <section className="mt-6 rounded-xl bg-white p-5"><h2 className="text-lg font-semibold">Recorded transactions</h2><div className="mt-4 divide-y divide-slate-100">{(transactions ?? []).slice(0, 25).map((t) => <div key={t.id} className="flex flex-wrap justify-between gap-2 py-4 text-sm"><span className="font-semibold">{t.transaction_type.toUpperCase()} {t.ticker ?? ""}</span><span className="text-slate-600">{t.transaction_date} · {t.quantity ?? "—"} shares · {money(Number(t.gross_amount ?? 0))}</span></div>)}</div>{(transactions ?? []).length > 25 && <p className="text-xs text-slate-500">Showing the latest 25 transactions.</p>}</section>}
    </div>
  </main>;
}
