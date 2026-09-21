import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { valueAgSleeve } from "@/lib/discovery/accelerated-growth/valuation";

export const dynamic = "force-dynamic";

/**
 * Local-only market-data diagnostic. Uses a synthetic 0.001-share NVDA
 * holding in memory only. It does not create a decision, transaction, holding,
 * contribution, or HWM update.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG quote diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: portfolio } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").single();
    if (!portfolio) throw new Error("Accelerated Growth portfolio not found.");

    const { data: era } = await supabase.from("portfolio_strategy_eras")
      .select("id,reference_total_capital,high_water_mark")
      .eq("user_id", user.id).eq("portfolio_id", portfolio.id)
      .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
    if (!era) throw new Error("Open Accelerated Growth era not found.");

    const syntheticQuantity = 0.001;
    const persistedHighWaterMark = Number(era.high_water_mark ?? era.reference_total_capital);
    const valuation = await valueAgSleeve({
      // Offset synthetic marked value is intentionally NOT attempted. This
      // endpoint validates provider-backed marking, not portfolio P/L math.
      sleeveCap: persistedHighWaterMark,
      netDeployed: persistedHighWaterMark,
      holdings: [{ ticker: "NVDA", quantity: syntheticQuantity }],
      persistedHighWaterMark,
    });

    return NextResponse.json({
      diagnostic: true,
      syntheticOnly: true,
      writesPerformed: [],
      ticker: "NVDA",
      quantity: syntheticQuantity,
      quotePrice: valuation.prices.NVDA,
      markedValue: valuation.holdingsMarketValue,
      providerQuoteResolved: Number.isFinite(valuation.prices.NVDA) && valuation.prices.NVDA > 0,
      missingSymbols: valuation.missingSymbols,
      note: "Quote/mark validation only; drawdown fields are not portfolio-state assertions in this synthetic diagnostic.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error." }, { status: 400 });
  }
}
