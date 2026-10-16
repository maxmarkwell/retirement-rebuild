import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HISTORICAL_TICKERS = ["SNX", "INOD", "QMCO", "AMAT", "AXTI", "COP", "RGR"] as const;

// Read-only historical baseline. Never calls the trading or decision-persistence paths.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: originals, error: originalsError } = await supabase
    .from("investment_decisions")
    .select("id,ticker,decision_type,status,created_at,thesis,bull_case,bear_case,reassessment_conditions,exit_conditions,confidence_score")
    .eq("user_id", user.id)
    .eq("source", "ai_committee")
    .in("ticker", [...HISTORICAL_TICKERS])
    .gte("created_at", "2026-10-16T00:00:00Z")
    .lt("created_at", "2026-10-17T00:00:00Z")
    .order("created_at", { ascending: true });

  if (originalsError) return NextResponse.json({ error: "Unable to load original AG decisions." }, { status: 500 });

  const { data: comparisons, error: comparisonsError } = await supabase
    .from("ag_historical_reassessments")
    .select("id,original_decision_id,ticker,reassessed_decision_type,reassessment_thesis,reassessment_rationale,valuation_evidence,valuation_data_quality,research_basis,committee_model,committee_prompt_version,created_at")
    .eq("user_id", user.id)
    .in("ticker", [...HISTORICAL_TICKERS])
    .order("created_at", { ascending: false });

  if (comparisonsError) return NextResponse.json({ error: "Unable to load AG reassessment comparisons." }, { status: 500 });

  return NextResponse.json({
    mode: "paper_research_only",
    transactionsEnabled: false,
    originalDecisionCount: originals?.length ?? 0,
    reassessmentCount: comparisons?.length ?? 0,
    originalDecisions: originals ?? [],
    reassessments: comparisons ?? [],
  });
}
