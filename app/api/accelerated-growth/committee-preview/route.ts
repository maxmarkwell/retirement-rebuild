import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Research-only Committee preview; does not create investment decisions.
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
    const body = await request.json() as { research?: AgDeepResearch };
    const research = body?.research;
    if (!research || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(research.symbol ?? "") || research.researchStatus !== "PROCEED" || research.promptVersion !== "ag-deep-research-v1" || !research.thesis?.trim() || !Array.isArray(research.evidenceAgainst) || !Array.isArray(research.invalidation)) return NextResponse.json({ error: "A valid PROCEED deep research result is required." }, { status: 400 });
    const decision = await runAgCommittee(research);
    return NextResponse.json({ version: "ag-committee-preview-v1", mode: "read_only", executionEnabled: false, decisionsPersisted: false, transactionsWritten: false, decision }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG committee preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Committee preview failed." }, { status: 500 });
  }
}
