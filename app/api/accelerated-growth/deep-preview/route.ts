import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { passesAgTradabilityGate } from "@/lib/discovery/accelerated-growth/discovery";
import { evaluateAcceleratedGrowthCandidate } from "@/lib/discovery/accelerated-growth/evaluate";
import { researchAgDeepCandidate } from "@/lib/discovery/accelerated-growth/deep-research";
import type { AgCatalystResearch } from "@/lib/discovery/accelerated-growth/catalyst-research";

// Client passes the catalyst output from the previous stage. Nothing is persisted.
export async function POST(request: NextRequest) {
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


  try {
    const body = await request.json() as { catalyst?: AgCatalystResearch };
    const catalyst = body?.catalyst;
    const symbol = catalyst?.symbol?.trim().toUpperCase();
    if (!symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) || catalyst?.catalystStatus === "NOT_FOUND" || !["SUPPORTED", "MIXED"].includes(catalyst?.catalystStatus ?? "") || catalyst?.promptVersion !== "ag-catalyst-v1" || !catalyst?.catalyst?.trim()) return NextResponse.json({ error: "A valid prior catalyst result is required." }, { status: 400 });
    const universe = await getDynamicDiscoveryUniverse();
    const stock = universe.find(item => item.ticker.toUpperCase() === symbol);
    if (!stock || !passesAgTradabilityGate(stock)) return NextResponse.json({ error: "Ticker is not currently tradable." }, { status: 422 });
    const evaluated = await evaluateAcceleratedGrowthCandidate(symbol);
    if (evaluated.score.status !== "ADVANCE") return NextResponse.json({ symbol, status: evaluated.score.status, error: "Current quantitative evaluation does not ADVANCE." }, { status: 422 });
    const candidate = { ...evaluated, selectorScore: 0, sector: stock.sector, industry: stock.industry };
    const research = await researchAgDeepCandidate(candidate, catalyst, null);
    return NextResponse.json({ version: "ag-deep-preview-v1", mode: "read_only", executionEnabled: false, decisionsPersisted: false, transactionsWritten: false, research }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG deep preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Deep research failed." }, { status: 500 });
  }
}
