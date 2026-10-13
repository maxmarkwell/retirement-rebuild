import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { passesAgTradabilityGate } from "@/lib/discovery/accelerated-growth/discovery";
import { evaluateAcceleratedGrowthCandidate } from "@/lib/discovery/accelerated-growth/evaluate";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
// Single-ticker quantitative Discovery diagnostic. Does not run universe ranking or persist state.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").maybeSingle();
  if (portfolioError || !portfolio) return NextResponse.json({ error: "An accessible AG paper portfolio is required." }, { status: 403 });
  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
    .is("ended_at", null).maybeSingle();
  if (eraError || !era) return NextResponse.json({ error: "An open AG paper strategy era is required." }, { status: 403 });
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return NextResponse.json({ error: "A valid symbol is required." }, { status: 400 });
  try {
    const universe = await getDynamicDiscoveryUniverse();
    const stock = universe.find(item => item.ticker.toUpperCase() === symbol);
    const eligible = !!stock && passesAgTradabilityGate(stock);
    const evaluation = eligible ? await evaluateAcceleratedGrowthCandidate(symbol) : null;
    return NextResponse.json({
      version: "ag-discovery-diagnostic-v1", mode: "read_only", scope: "single_ticker_not_universe_ranking",
      symbol, universeEligible: eligible, advancement: eligible ? evaluation?.score.status : "INELIGIBLE",
      executionEnabled: false, decisionsPersisted: false, transactionsWritten: false,
      evaluation, message: eligible ? "Current quantitative scoring; not a full-universe ranking." : "Ticker not in the current tradable AG universe.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG discovery diagnostic failed", { symbol, error });
    return NextResponse.json({ symbol, error: error instanceof Error ? error.message : "Discovery diagnostic failed." }, { status: 500 });
  }
}
