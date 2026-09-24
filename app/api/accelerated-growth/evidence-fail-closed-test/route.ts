import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeAgPaperBuy } from "@/lib/discovery/accelerated-growth/paper-execution";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG evidence fail-closed test is disabled in production." }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").single();
    if (portfolioError || !portfolio) throw new Error("AG paper portfolio not found.");

    const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
      .select("inception_at").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
      .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
    if (eraError || !era) throw new Error("Open AG paper era not found.");

    const ticker = "AGEVID";
    const { data: existing } = await supabase.from("investment_decisions").select("id")
      .eq("portfolio_id", portfolio.id).eq("user_id", user.id).eq("ticker", ticker)
      .eq("source", "ai_committee").gte("created_at", era.inception_at).maybeSingle();

    let decisionId = existing?.id;
    if (!decisionId) {
      const { data: row, error } = await supabase.from("investment_decisions").insert({
        user_id: user.id, portfolio_id: portfolio.id, transaction_id: null,
        decision_type: "buy", ticker, decision_date: new Date().toISOString(),
        confidence_score: 100, thesis: "Synthetic missing-evidence fail-closed fixture.",
        bull_case: "Synthetic fixture.", bear_case: "Synthetic fixture.",
        primary_risks: "Synthetic fixture.", reassessment_conditions: "Delete after test.",
        exit_conditions: "Any non-test use.", source: "ai_committee", status: "active",
        ag_thesis_valid: null, ag_liquidity_eligible: null, ag_evidence_version: null,
      }).select("id").single();
      if (error || !row) throw new Error(`Unable to create AGEVID fixture: ${error?.message ?? "Unknown error"}`);
      decisionId = row.id;
    }

    let executionError: string | null = null;
    try { await executeAgPaperBuy({ decisionId }); }
    catch (error) { executionError = error instanceof Error ? error.message : "Unknown execution error."; }

    const { data: after, error: afterError } = await supabase.from("investment_decisions")
      .select("id,status,transaction_id,ag_thesis_valid,ag_liquidity_eligible,ag_evidence_version")
      .eq("id", decisionId).eq("user_id", user.id).single();
    if (afterError || !after) throw new Error("Unable to verify AGEVID fixture.");

    const { data: txs, error: txError } = await supabase.from("transactions").select("id")
      .eq("portfolio_id", portfolio.id).eq("ticker", ticker);
    if (txError) throw txError;

    const blockedForEvidence = executionError === "AG BUY lacks persisted thesis/liquidity execution evidence.";
    const ledgerClean = after.status === "active" && !after.transaction_id && (txs ?? []).length === 0;

    return NextResponse.json({
      evidenceFailClosedTest: true, decisionId, blockedForEvidence, ledgerClean,
      passed: blockedForEvidence && ledgerClean, executionError, after,
      fixtureTransactionCount: (txs ?? []).length,
    });
  } catch (error) {
    return NextResponse.json(
      { evidenceFailClosedTest: false, error: error instanceof Error ? error.message : "Unknown evidence test error." },
      { status: 400 },
    );
  }
}
