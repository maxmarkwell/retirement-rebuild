import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG BUY fixture is disabled in production." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: portfolio } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").single();
  if (!portfolio) return NextResponse.json({ error: "paper_active portfolio not found." }, { status: 400 });

  const { data: era } = await supabase.from("portfolio_strategy_eras")
    .select("id, inception_at").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
  if (!era) return NextResponse.json({ error: "Open paper AG era not found." }, { status: 400 });

  const ticker = "AGFIX";
  const { data: existing } = await supabase.from("investment_decisions")
    .select("id, decision_type, status, transaction_id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("ticker", ticker).eq("source", "ai_committee")
    .gte("created_at", era.inception_at).order("created_at", { ascending: true }).limit(1).maybeSingle();

  if (existing) {
    return NextResponse.json({ created: false, fixture: true, decisionId: existing.id, ticker, decision: existing.decision_type, status: existing.status, transactionId: existing.transaction_id });
  }

  const now = new Date().toISOString();
  const { data: row, error } = await supabase.from("investment_decisions").insert({
    user_id: user.id,
    portfolio_id: portfolio.id,
    transaction_id: null,
    decision_type: "buy",
    ticker,
    decision_date: now,
    decision_price: null,
    recommended_quantity: null,
    recommended_allocation: null,
    confidence_score: 1,
    risk_level: null,
    expected_holding_period: "TEST FIXTURE — not an investment recommendation",
    thesis: "TEST FIXTURE ONLY — deterministic AG BUY lifecycle validation.",
    bull_case: "TEST FIXTURE ONLY",
    bear_case: "TEST FIXTURE ONLY",
    primary_risks: "TEST FIXTURE ONLY",
    reassessment_conditions: "TEST FIXTURE ONLY",
    exit_conditions: "TEST FIXTURE ONLY",
    source: "ai_committee",
    status: "active",
  }).select("id").single();

  if (error || !row) return NextResponse.json({ error: error?.message ?? "Unable to create fixture." }, { status: 500 });
  return NextResponse.json({ created: true, fixture: true, decisionId: row.id, ticker, decision: "buy", status: "active", transactionId: null });
}
