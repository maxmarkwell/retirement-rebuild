import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "@/lib/discovery/accelerated-growth/era-accounting";
import { evaluateAgPortfolioGuardrails } from "@/lib/discovery/accelerated-growth/portfolio-guardrails";
import { sizeAgBuy } from "@/lib/discovery/accelerated-growth/risk-sizing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "AG paper execution dry-run is disabled in production." }, { status: 404 });
  const decisionId = request.nextUrl.searchParams.get("decisionId");
  const price = Number(request.nextUrl.searchParams.get("price"));
  if (!decisionId || !Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "decisionId and positive price are required." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: decision } = await supabase.from("investment_decisions")
    .select("id, portfolio_id, transaction_id, decision_type, ticker, source, status, created_at")
    .eq("id", decisionId).eq("user_id", user.id).single();
  if (!decision || decision.source !== "ai_committee" || decision.decision_type !== "buy" || decision.status !== "active" || decision.transaction_id) {
    return NextResponse.json({ error: "An active unexecuted AG Committee BUY decision is required." }, { status: 400 });
  }

  const { data: era } = await supabase.from("portfolio_strategy_eras")
    .select("id, portfolio_id, strategy_key, strategy_version, inception_at, reference_total_capital, execution_mode, ended_at")
    .eq("portfolio_id", decision.portfolio_id).eq("user_id", user.id).eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper").is("ended_at", null).single();
  if (!era) return NextResponse.json({ error: "Open paper AG era not found." }, { status: 400 });

  const { data: transactions } = await supabase.from("transactions")
    .select("transaction_type, ticker, quantity, gross_amount, fees, created_at")
    .eq("portfolio_id", decision.portfolio_id).gte("created_at", era.inception_at);
  const { data: contributions } = await supabase.from("contributions")
    .select("amount, created_at").eq("portfolio_id", decision.portfolio_id).gte("created_at", era.inception_at);

  const accounting = calculateAgEraAccounting(era, [
    ...(transactions ?? []).map(t => ({
      type: t.transaction_type,
      total_amount: t.transaction_type === "buy" ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0) : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
      created_at: t.created_at,
    })),
    ...(contributions ?? []).map(c => ({ type: "contribution", total_amount: Number(c.amount), created_at: c.created_at })),
  ]);

  const holdings = new Map<string, { quantity: number; cost: number }>();
  for (const tx of transactions ?? []) {
    if (!tx.ticker || tx.quantity == null) continue;
    const ticker = tx.ticker.toUpperCase();
    const q = Number(tx.quantity);
    const current = holdings.get(ticker) ?? { quantity: 0, cost: 0 };
    if (tx.transaction_type === "buy") holdings.set(ticker, { quantity: current.quantity + q, cost: current.cost + Number(tx.gross_amount ?? 0) + Number(tx.fees ?? 0) });
    else if (tx.transaction_type === "sell" && current.quantity > 0) {
      const sold = Math.min(q, current.quantity);
      const avg = current.cost / current.quantity;
      holdings.set(ticker, { quantity: current.quantity - sold, cost: Math.max(0, current.cost - sold * avg) });
    }
  }
  const currentAgExposure = Array.from(holdings.values()).reduce((s,h)=>s+h.cost,0);
  const currentPositionExposure = holdings.get(decision.ticker.toUpperCase())?.cost ?? 0;

  // Conservative v1 dry-run: theme exposure equals total AG exposure and drawdown is
  // not caller-controlled. Until authoritative theme/HWM state exists, assume 0 drawdown.
  const currentThemeExposure = currentAgExposure;
  const sleeveDrawdownPct = 0;
  const guardrails = evaluateAgPortfolioGuardrails({
    referenceTotalCapital: accounting.referenceTotalCapital,
    currentAgMarketValue: currentAgExposure,
    currentThemeMarketValue: currentThemeExposure,
    currentPositionMarketValue: currentPositionExposure,
    availableCash: accounting.eraCash,
    sleeveDrawdownPct,
    thesisValid: true,
    liquidityEligible: true,
    reassessmentComplete: false,
  });
  const sizing = sizeAgBuy({
    referenceTotalCapital: accounting.referenceTotalCapital,
    availableCash: accounting.eraCash,
    currentAgMarketValue: currentAgExposure,
    currentPositionMarketValue: currentPositionExposure,
    currentThemeMarketValue: currentThemeExposure,
    price,
    committeeDecision: "BUY",
    liquidityEligible: true,
    thesisValid: true,
    isExistingPosition: currentPositionExposure > 0,
    allowAdd: false,
  });

  return NextResponse.json({
    dryRun: true,
    writesPerformed: false,
    decision: { id: decision.id, ticker: decision.ticker },
    accounting,
    exposure: { currentAgExposure, currentPositionExposure, currentThemeExposure, sleeveDrawdownPct },
    guardrails,
    sizing,
    projectedCashAfter: sizing.eligible ? Math.round((accounting.eraCash - sizing.targetNotional) * 100) / 100 : accounting.eraCash,
  });
}
