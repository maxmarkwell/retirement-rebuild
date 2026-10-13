import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAcceleratedGrowthDiscovery } from "@/lib/discovery/accelerated-growth/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bounded universe Discovery diagnostic only. No Catalyst, Committee, persistence, or execution.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").eq("is_real_money", false).maybeSingle();
  if (portfolioError || !portfolio) return NextResponse.json({ error: "An accessible AG paper portfolio is required." }, { status: 403 });

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
    .is("ended_at", null).maybeSingle();
  if (eraError || !era) return NextResponse.json({ error: "An open AG paper strategy era is required." }, { status: 403 });

  try {
    const result = await runAcceleratedGrowthDiscovery();
    return NextResponse.json({
      version: "ag-universe-discovery-diagnostic-v1",
      mode: "read_only",
      scope: "bounded_universe_preselection_not_exhaustive_ranking",
      executionEnabled: false,
      decisionsPersisted: false,
      transactionsWritten: false,
      universeCount: result.universeCount,
      eligibleUniverseCount: result.eligibleUniverseCount,
      rejectedByTradabilityCount: result.rejectedByTradabilityCount,
      preselectedCount: result.preselectedCount,
      evaluatedCount: result.evaluatedCount,
      advanceCount: result.advanceCount,
      reviewCount: result.reviewCount,
      rejectCount: result.rejectCount,
      insufficientDataCount: result.insufficientDataCount,
      rateLimited: result.rateLimited,
      stoppedEarly: result.stoppedEarly,
      bucketSelectionCounts: result.bucketSelectionCounts,
      candidates: result.candidates.map(candidate => ({
        symbol: candidate.symbol,
        companyName: candidate.companyName,
        sector: candidate.sector,
        industry: candidate.industry,
        marketCap: candidate.marketCap,
        marketCapBucket: candidate.marketCapBucket,
        selectorScore: candidate.selectorScore,
        score: candidate.score,
      })),
      errors: result.errors,
      message: "Read-only bounded Discovery shortlist. ADVANCE permits further research, not an investment recommendation.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG universe Discovery diagnostic failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Universe Discovery diagnostic failed." }, { status: 500 });
  }
}
