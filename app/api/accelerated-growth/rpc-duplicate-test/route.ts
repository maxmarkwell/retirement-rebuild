import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG RPC duplicate test is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "paper_active")
      .single();
    if (portfolioError || !portfolio) throw new Error("Accelerated Growth portfolio not found.");

    const { data: era, error: eraError } = await supabase
      .from("portfolio_strategy_eras")
      .select("inception_at")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("strategy_key", "accelerated_growth")
      .eq("execution_mode", "paper")
      .is("ended_at", null)
      .single();
    if (eraError || !era) throw new Error("Open Accelerated Growth paper era not found.");

    const originalFixtureDecisionId = "a4e49f40-49e4-4feb-ac4b-ad85e1d380d4";
    const { data: decision, error: decisionError } = await supabase
      .from("investment_decisions")
      .select("id,ticker,status,transaction_id")
      .eq("id", originalFixtureDecisionId)
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("ticker", "AGFIX")
      .eq("source", "ai_committee")
      .gte("created_at", era.inception_at)
      .single();
    if (decisionError || !decision) throw new Error("Original AGFIX fixture decision not found.");

    const { data, error } = await supabase.rpc("execute_ag_paper_buy_atomic", {
      p_decision_id: decision.id,
      p_quantity: 0.05,
      p_price: 100,
      p_gross_amount: 5,
      p_notes: "TEST ONLY — authenticated direct RPC duplicate validation",
    });

    if (error) {
      return NextResponse.json({
        duplicateBlocked: true,
        authenticated: true,
        bypassedApplicationGuardrails: true,
        decision,
        rpcError: error.message,
      });
    }

    return NextResponse.json({
      duplicateBlocked: false,
      authenticated: true,
      bypassedApplicationGuardrails: true,
      decision,
      unexpectedRpcResult: data,
      warning: "Duplicate RPC execution unexpectedly succeeded.",
    }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { duplicateBlocked: false, error: error instanceof Error ? error.message : "Unknown error." },
      { status: 400 }
    );
  }
}
