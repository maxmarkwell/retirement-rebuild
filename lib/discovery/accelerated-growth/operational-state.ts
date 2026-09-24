import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "./era-accounting";
import { valueAgSleeve } from "./valuation";

export async function getAgOperationalState() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").single();
  if (portfolioError || !portfolio) throw new Error("paper_active portfolio not found.");

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id, portfolio_id, strategy_key, strategy_version, inception_at, reference_total_capital, high_water_mark, execution_mode, ended_at")
    .eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
  if (eraError || !era) throw new Error("Open paper AG era not found.");

  const [{ data: transactions, error: txError }, { data: contributions, error: contributionError }, { data: decisions, error: decisionError }, { data: researchWatchlist, error: watchlistError }] = await Promise.all([
    supabase.from("transactions").select("id, transaction_type, ticker, quantity, gross_amount, fees, created_at, ag_theme_key")
      .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at).order("created_at", { ascending: true }),
    supabase.from("contributions").select("amount, created_at").eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at),
    supabase.from("investment_decisions").select("id, ticker, decision_type, status, confidence_score, thesis, created_at, transaction_id, ag_theme_key")
      .eq("portfolio_id", portfolio.id).eq("source", "ai_committee").gte("created_at", era.inception_at).order("created_at", { ascending: false }).limit(25),
    supabase.from("ag_research_watchlist")
      .select("id, ticker, company_name, confidence, thesis, unresolved_questions, thesis_clock, first_seen_at, last_seen_at")
      .eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).is("resolved_at", null)
      .order("last_seen_at", { ascending: false }),
  ]);
  if (txError) throw new Error(`Unable to load AG transactions: ${txError.message}`);
  if (contributionError) throw new Error(`Unable to load AG contributions: ${contributionError.message}`);
  if (decisionError) throw new Error(`Unable to load AG decisions: ${decisionError.message}`);
  if (watchlistError) throw new Error(`Unable to load AG research watchlist: ${watchlistError.message}`);

  const accounting = calculateAgEraAccounting(era, [
    ...(transactions ?? []).map((t) => ({
      type: t.transaction_type,
      total_amount: t.transaction_type === "buy" ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0) : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
      created_at: t.created_at,
    })),
    ...(contributions ?? []).map((x) => ({ type: "contribution", total_amount: Number(x.amount), created_at: x.created_at })),
  ]);

  const holdings = new Map<string, { quantity: number; cost: number; themeKey: string | null }>();
  for (const tx of transactions ?? []) {
    if (!tx.ticker || tx.quantity == null) continue;
    const ticker = tx.ticker.toUpperCase();
    const quantity = Number(tx.quantity);
    const current = holdings.get(ticker) ?? { quantity: 0, cost: 0, themeKey: null };
    if (current.quantity > 0 && (!tx.ag_theme_key || (current.themeKey && current.themeKey !== tx.ag_theme_key))) {
      throw new Error(`AG operational state blocked: incomplete or inconsistent theme attribution for ${ticker}.`);
    }
    const themeKey = tx.ag_theme_key ?? current.themeKey;
    if (tx.transaction_type === "buy") {
      holdings.set(ticker, { quantity: current.quantity + quantity, cost: current.cost + Number(tx.gross_amount ?? 0) + Number(tx.fees ?? 0), themeKey });
    } else if (tx.transaction_type === "sell" && current.quantity > 0) {
      const sold = Math.min(quantity, current.quantity);
      const averageCost = current.cost / current.quantity;
      holdings.set(ticker, { quantity: current.quantity - sold, cost: Math.max(0, current.cost - sold * averageCost), themeKey });
    }
  }

  const openHoldings = Array.from(holdings.entries()).filter(([, h]) => h.quantity > 0);
  const valuation = await valueAgSleeve({
    sleeveCap: accounting.sleeveCap,
    netDeployed: accounting.eraNetDeployed,
    holdings: openHoldings.map(([ticker, h]) => ({ ticker, quantity: h.quantity })),
    persistedHighWaterMark: Number(era.high_water_mark ?? accounting.sleeveCap),
  });

  return {
    portfolioId: portfolio.id,
    eraId: era.id,
    inceptionAt: era.inception_at,
    accounting: {
      ...accounting,
      sleeveCash: Math.round((accounting.sleeveCap - accounting.eraNetDeployed) * 100) / 100,
    },
    valuation,
    holdings: openHoldings.map(([ticker, h]) => ({
      ticker, quantity: h.quantity, cost: Math.round(h.cost * 100) / 100,
      price: valuation.prices[ticker], marketValue: Math.round(h.quantity * valuation.prices[ticker] * 100) / 100,
      themeKey: h.themeKey,
    })),
    activeDecisions: (decisions ?? []).filter((d) => d.status === "active"),
    researchWatchlist: researchWatchlist ?? [],
    recentDecisions: decisions ?? [],
  };
}
