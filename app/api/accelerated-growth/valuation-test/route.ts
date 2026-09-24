import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "@/lib/discovery/accelerated-growth/era-accounting";
import { valueAgSleeve } from "@/lib/discovery/accelerated-growth/valuation";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG valuation diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: portfolio } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").single();
    if (!portfolio) throw new Error("Accelerated Growth portfolio not found.");

    const { data: era } = await supabase.from("portfolio_strategy_eras")
      .select("id,portfolio_id,strategy_key,strategy_version,inception_at,reference_total_capital,high_water_mark,execution_mode,ended_at")
      .eq("user_id", user.id).eq("portfolio_id", portfolio.id)
      .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
    if (!era) throw new Error("Open Accelerated Growth era not found.");

    const { data: transactions, error: txError } = await supabase.from("transactions")
      .select("transaction_type,ticker,quantity,gross_amount,fees,created_at")
      .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
    if (txError) throw txError;

    const { data: contributions, error: contributionError } = await supabase.from("contributions")
      .select("amount,created_at").eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
    if (contributionError) throw contributionError;

    const accounting = calculateAgEraAccounting(era, [
      ...(transactions ?? []).map((t) => ({
        type: t.transaction_type,
        total_amount: t.transaction_type === "buy"
          ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0)
          : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
        created_at: t.created_at,
      })),
      ...(contributions ?? []).map((c) => ({
        type: "contribution",
        total_amount: Number(c.amount),
        created_at: c.created_at,
      })),
    ]);

    const holdings = new Map<string, number>();
    for (const tx of transactions ?? []) {
      if (!tx.ticker || tx.quantity == null) continue;
      const ticker = tx.ticker.toUpperCase();
      const quantity = Number(tx.quantity);
      const current = holdings.get(ticker) ?? 0;
      if (tx.transaction_type === "buy") holdings.set(ticker, current + quantity);
      if (tx.transaction_type === "sell") holdings.set(ticker, Math.max(0, current - quantity));
    }

    const valuation = await valueAgSleeve({
      sleeveCap: accounting.sleeveCap,
      netDeployed: accounting.eraNetDeployed,
      holdings: Array.from(holdings.entries()).map(([ticker, quantity]) => ({ ticker, quantity })),
      persistedHighWaterMark: Number(era.high_water_mark ?? era.reference_total_capital),
    });

    let persistedHighWaterMark = Number(era.high_water_mark ?? era.reference_total_capital);
    if (valuation.highWaterMark > persistedHighWaterMark) {
      const { data: advanced, error: hwmError } = await supabase.rpc("advance_ag_high_water_mark", {
        p_era_id: era.id,
        p_current_equity: valuation.currentEquity,
      });
      if (hwmError) throw hwmError;
      persistedHighWaterMark = Number(advanced);
    }

    return NextResponse.json({
      diagnostic: true,
      writesPerformed: valuation.highWaterMark > Number(era.high_water_mark ?? era.reference_total_capital)
        ? ["high_water_mark advancement only"]
        : [],
      accounting,
      openHoldings: Array.from(holdings.entries()).map(([ticker, quantity]) => ({ ticker, quantity })),
      valuation,
      persistedHighWaterMark,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 400 });
  }
}
