import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { passesAgTradabilityGate } from "@/lib/discovery/accelerated-growth/discovery";
import { evaluateAcceleratedGrowthCandidate } from "@/lib/discovery/accelerated-growth/evaluate";
import { researchAgCatalyst } from "@/lib/discovery/accelerated-growth/catalyst-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Single-candidate, read-only catalyst diagnostic. No persistence or transactions.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").maybeSingle();
  if (portfolioError || !portfolio) {
    return NextResponse.json({ error: "An accessible AG paper portfolio is required." }, { status: 403 });
  }
  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
    .is("ended_at", null).maybeSingle();
  if (eraError || !era) {
    return NextResponse.json({ error: "An open AG paper strategy era is required." }, { status: 403 });
  }

  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return NextResponse.json({ error: "A valid symbol is required." }, { status: 400 });
  try {
    const universe = await getDynamicDiscoveryUniverse();
    const stock = universe.find((item) => item.ticker.toUpperCase() === symbol);
    if (!stock || !passesAgTradabilityGate(stock)) return NextResponse.json({ error: "Ticker is not in today's tradable AG universe." }, { status: 422 });
    const evaluated = await evaluateAcceleratedGrowthCandidate(symbol);
    if (evaluated.score.status !== "ADVANCE") return NextResponse.json({ symbol, status: evaluated.score.status, message: "Catalyst research requires a current ADVANCE." }, { status: 422 });
    const candidate = { ...evaluated, selectorScore: 0, sector: stock.sector, industry: stock.industry };
    const catalyst = await researchAgCatalyst(candidate);
    return NextResponse.json({ version: "ag-catalyst-diagnostic-v1", mode: "read_only", symbol, executionEnabled: false, decisionsPersisted: false, transactionsWritten: false, catalyst }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG catalyst diagnostic failed", { symbol, error });
    return NextResponse.json({ symbol, error: error instanceof Error ? error.message : "Catalyst diagnostic failed." }, { status: 500 });
  }
}
