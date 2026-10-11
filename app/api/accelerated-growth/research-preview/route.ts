import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgCommitteePipeline } from "@/lib/discovery/accelerated-growth/committee-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Authenticated research preview. No cycle, decision, watchlist, or trade persistence.
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

  const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
  const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
  try {
    const result = await runAgCommitteePipeline({ maxCandidates });
    return NextResponse.json({
      version: "ag-research-preview-v1", mode: "read_only", generatedAt: new Date().toISOString(),
      executionEnabled: false, transactionsWritten: false, decisionsPersisted: false,
      portfolioId: portfolio.id, strategyEraId: era.id,
      discovery: result.upstream.discovery,
      catalystSupportedCount: result.upstream.catalystSupportedCount,
      deepResearchCompletedCount: result.upstream.deepResearchCompletedCount,
      deepResearchFailedCount: result.upstream.deepResearchFailedCount,
      deepResearchOutcomes: result.upstream.deepResearchOutcomes,
      proceedCount: result.upstream.proceedCount,
      committeeRequestedCount: result.requestedCount,
      committeeCompletedCount: result.completedCount,
      committeeFailedCount: result.failedCount,
      decisions: result.decisions,
      errors: result.errors,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG read-only research preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "AG research preview failed." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
