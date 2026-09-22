import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { deriveAgExecutionEvidence } from "@/lib/discovery/accelerated-growth/execution-evidence";
import { executeAgPaperBuy } from "@/lib/discovery/accelerated-growth/paper-execution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG hardened execution diagnostic is disabled in production." }, { status: 404 });
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

  const universe = await getDynamicDiscoveryUniverse();
  const stock = universe.find((x) => x.ticker === "NVDA");
  const evidence = deriveAgExecutionEvidence(stock);
  if (!stock || !evidence.liquidityEligible || !evidence.themeKey) {
    return NextResponse.json({ error: "NVDA did not resolve complete deterministic execution evidence.", evidence }, { status: 409 });
  }

  const ticker = "NVDA";
  const marker = "AG HARDENED EXECUTION FIXTURE";
  const { data: existing } = await supabase.from("investment_decisions")
    .select("id, status, transaction_id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("ticker", ticker).eq("source", "ai_committee").eq("thesis", marker)
    .gte("created_at", era.inception_at).order("created_at", { ascending: false }).limit(1).maybeSingle();

  let decisionId = existing?.id ?? null;
  if (!decisionId) {
    const now = new Date().toISOString();
    const { data: row, error } = await supabase.from("investment_decisions").insert({
      user_id: user.id, portfolio_id: portfolio.id, transaction_id: null,
      decision_type: "buy", ticker, decision_date: now, decision_price: null,
      recommended_quantity: null, recommended_allocation: null, confidence_score: 1,
      risk_level: null, expected_holding_period: "TEST FIXTURE ONLY",
      thesis: marker, bull_case: marker, bear_case: marker, primary_risks: marker,
      reassessment_conditions: marker, exit_conditions: marker,
      ag_thesis_valid: true, ag_liquidity_eligible: evidence.liquidityEligible,
      ag_evidence_version: evidence.evidenceVersion, ag_theme_key: evidence.themeKey,
      source: "ai_committee", status: "active",
    }).select("id").single();
    if (error || !row) return NextResponse.json({ error: error?.message ?? "Unable to create hardened fixture." }, { status: 500 });
    decisionId = row.id;
  }

  if (existing?.transaction_id || existing?.status !== undefined && existing.status !== "active") {
    return NextResponse.json({ error: "Existing hardened fixture is not executable; clean it before rerunning.", decisionId, existing }, { status: 409 });
  }

  try {
    const execution = await executeAgPaperBuy({ decisionId });
    const { data: transaction } = await supabase.from("transactions")
      .select("id, ticker, transaction_type, quantity, price_per_share, gross_amount, ag_theme_key")
      .eq("id", execution.transactionId).single();
    const { data: linkedDecision } = await supabase.from("investment_decisions")
      .select("id, status, transaction_id, ag_thesis_valid, ag_liquidity_eligible, ag_evidence_version, ag_theme_key")
      .eq("id", decisionId).single();

    const passed =
      transaction?.ag_theme_key === evidence.themeKey &&
      linkedDecision?.transaction_id === execution.transactionId &&
      linkedDecision?.status === "executed" &&
      execution.sizing.targetNotional === 5 &&
      execution.guardrails.buyAllowed === true;

    return NextResponse.json({
      hardenedExecutionDiagnostic: true,
      fixture: true,
      cleanupRequired: true,
      passed,
      evidence,
      execution: {
        decisionId: execution.decisionId, transactionId: execution.transactionId,
        authorizationId: execution.authorizationId, ticker: execution.ticker,
        quantity: execution.quantity, price: execution.price, grossAmount: execution.grossAmount,
        targetNotional: execution.sizing.targetNotional, buyAllowed: execution.guardrails.buyAllowed,
      },
      linkedDecision,
      transaction,
    });
  } catch (error) {
    return NextResponse.json({
      hardenedExecutionDiagnostic: true, fixture: true, cleanupRequired: true, passed: false,
      decisionId, evidence, error: error instanceof Error ? error.message : "Unknown hardened execution error.",
    }, { status: 400 });
  }
}
