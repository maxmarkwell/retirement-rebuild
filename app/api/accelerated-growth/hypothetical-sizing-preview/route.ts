import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "@/lib/discovery/accelerated-growth/era-accounting";
import { valueAgSleeve } from "@/lib/discovery/accelerated-growth/valuation";
import { calculateAgThemeMarketValue } from "@/lib/discovery/accelerated-growth/theme-exposure";
import { evaluateAgPortfolioGuardrails } from "@/lib/discovery/accelerated-growth/portfolio-guardrails";
import { sizeAgBuy } from "@/lib/discovery/accelerated-growth/risk-sizing";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { deriveAgExecutionEvidence } from "@/lib/discovery/accelerated-growth/execution-evidence";
import { getMarketQuote } from "@/lib/market-data/twelve-data";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };


function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Hypothetical VRT-only research sizing simulation.
 * Does not assert a persisted/executable BUY or reconstruct past research.
 * Uses user-scoped AG paper accounting, current dynamic-universe liquidity/theme
 * evidence, market quotes, and the existing deterministic risk constitution.
 * Absolutely no Supabase writes, RPC calls, or transaction authorizations.
 */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (symbol !== "VRT") return json({ error: "This diagnostic is restricted to the VRT research case." }, 400);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required." }, 401);

  try {
    const { data: portfolios, error: portfolioError } = await supabase.from("portfolios")
      .select("id, type, is_real_money").eq("user_id", user.id).eq("type", "paper_active").eq("is_real_money", false).limit(2);
    if (portfolioError || !portfolios || portfolios.length !== 1) return json({ error: "Exactly one accessible non-real-money AG paper portfolio is required." }, 403);
    const portfolio = portfolios[0];

    const { data: eras, error: eraError } = await supabase.from("portfolio_strategy_eras")
      .select("id, portfolio_id, strategy_key, strategy_version, execution_mode, inception_at, ended_at, reference_total_capital, high_water_mark")
      .eq("portfolio_id", portfolio.id).eq("user_id", user.id).eq("strategy_key", "accelerated_growth")
      .eq("execution_mode", "paper").is("ended_at", null).limit(2);
    if (eraError || !eras || eras.length !== 1) return json({ error: "Exactly one open paper Accelerated Growth strategy era is required." }, 403);
    const era = eras[0];

    // A hypothetical BUY must never be mistaken for a persisted decision.
    // Refuse ambiguous existing active decisions instead of silently superseding them.
    const { data: activeDecisions, error: decisionError } = await supabase.from("investment_decisions")
      .select("id, transaction_id, decision_type").eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id).eq("ticker", symbol)
      .eq("source", "ai_committee").eq("status", "active").gte("created_at", era.inception_at).limit(2);
    if (decisionError) throw new Error("Unable to inspect AG decision conflicts.");
    if ((activeDecisions?.length ?? 0) > 0) return json({
      version: "ag-hypothetical-sizing-v1", mode: "read_only", symbol, hypothetical: true,
      eligible: false, reasons: ["An active persisted Committee decision exists; use the persisted decision preview instead."],
      sizing: null, executionEligible: false, transactionsWritten: false, decisionsPersisted: false,
    });

    const universe = await getDynamicDiscoveryUniverse();
    const candidates = universe.filter(stock => stock.ticker.toUpperCase() === symbol);
    if (candidates.length !== 1) return json({
      version: "ag-hypothetical-sizing-v1", mode: "read_only", symbol, hypothetical: true,
      eligible: false, reasons: ["VRT lacks unique current dynamic-universe execution evidence."],
      sizing: null, executionEligible: false, transactionsWritten: false, decisionsPersisted: false,
    });
    const evidence = deriveAgExecutionEvidence(candidates[0]);
    if (!evidence.themeKey) return json({
      version: "ag-hypothetical-sizing-v1", mode: "read_only", symbol, hypothetical: true,
      eligible: false, reasons: ["Current VRT theme attribution is missing."],
      sizing: null, executionEligible: false, transactionsWritten: false, decisionsPersisted: false,
    });

    const [txResult, contributionResult] = await Promise.all([
      supabase.from("transactions").select("transaction_type, ticker, quantity, price_per_share, gross_amount, fees, created_at, ag_theme_key")
        .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at),
      supabase.from("contributions").select("amount, created_at")
        .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at),
    ]);
    if (txResult.error || contributionResult.error) throw new Error("Unable to load complete AG era accounting.");
    const transactions = txResult.data ?? [];
    const contributions = contributionResult.data ?? [];
    const accounting = calculateAgEraAccounting(era, [
      ...transactions.map(t => ({
        type: t.transaction_type,
        total_amount: t.transaction_type === "buy" ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0) : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
        created_at: t.created_at,
      })),
      ...contributions.map(c => ({ type: "contribution", total_amount: Number(c.amount), created_at: c.created_at })),
    ]);
    const holdings = new Map<string, { quantity: number; cost: number }>();
    for (const t of transactions) {
      if (!t.ticker || t.quantity == null) continue;
      const ticker = t.ticker.toUpperCase(), quantity = Number(t.quantity);
      const current = holdings.get(ticker) ?? { quantity: 0, cost: 0 };
      if (t.transaction_type === "buy") {
        holdings.set(ticker, { quantity: current.quantity + quantity, cost: current.cost + Number(t.gross_amount ?? 0) + Number(t.fees ?? 0) });
      } else if (t.transaction_type === "sell" && current.quantity > 0) {
        const sold = Math.min(quantity, current.quantity);
        holdings.set(ticker, { quantity: current.quantity - sold, cost: Math.max(0, current.cost - sold * current.cost / current.quantity) });
      }
    }

    const openHoldings = Array.from(holdings.entries()).filter(([, h]) => h.quantity > 0)
      .map(([ticker, h]) => ({ ticker, quantity: h.quantity }));
    const valuation = await valueAgSleeve({
      sleeveCap: accounting.sleeveCap, netDeployed: accounting.eraNetDeployed,
      holdings: openHoldings, persistedHighWaterMark: Number(era.high_water_mark ?? era.reference_total_capital),
    });
    const themeExposure = calculateAgThemeMarketValue({
      targetThemeKey: evidence.themeKey, holdings: openHoldings, prices: valuation.prices,
      transactions: transactions.map(t => ({ ticker: t.ticker, ag_theme_key: t.ag_theme_key })),
    });
    const quote = await getMarketQuote(symbol);
    const price = Number(quote.price);
    const holding = holdings.get(symbol);
    const positionMarketValue = holding && holding.quantity > 0
      ? Math.round(holding.quantity * (valuation.prices[symbol] ?? 0) * 100) / 100 : 0;

    const guardrails = evaluateAgPortfolioGuardrails({
      referenceTotalCapital: accounting.referenceTotalCapital,
      currentAgMarketValue: valuation.holdingsMarketValue,
      currentThemeMarketValue: themeExposure,
      currentPositionMarketValue: positionMarketValue,
      availableCash: accounting.eraCash,
      sleeveDrawdownPct: valuation.drawdownPct,
      liquidityEligible: evidence.liquidityEligible,
      thesisValid: true, // Explicitly hypothetical; October 26 Committee preview supplied by user
      reassessmentComplete: false,
    });
    const sizing = guardrails.buyAllowed ? sizeAgBuy({
      referenceTotalCapital: accounting.referenceTotalCapital,
      availableCash: accounting.eraCash,
      currentAgMarketValue: valuation.holdingsMarketValue,
      currentPositionMarketValue: positionMarketValue,
      currentThemeMarketValue: themeExposure,
      price,
      committeeDecision: "BUY", // hypothetical research-only input, never persisted
      liquidityEligible: evidence.liquidityEligible,
      thesisValid: true,
      isExistingPosition: positionMarketValue > 0,
      allowAdd: positionMarketValue > 0 ? guardrails.addAllowed : undefined,
    }) : null;

    return json({
      version: "ag-hypothetical-sizing-v1", mode: "read_only", symbol, hypothetical: true,
      eligible: guardrails.buyAllowed && sizing?.eligible === true, executionEligible: false,
      reasons: guardrails.buyAllowed ? (sizing?.reasons ?? []) : guardrails.reasons,
      guardrails, sizing,
      portfolio: { type: portfolio.type, referenceTotalCapital: accounting.referenceTotalCapital,
        availableCash: accounting.eraCash, holdingsMarketValue: valuation.holdingsMarketValue,
        currentPositionMarketValue: positionMarketValue, currentThemeMarketValue: themeExposure,
        sleeveDrawdownPct: valuation.drawdownPct },
      quotePrice: price, evidence: { liquidityEligible: evidence.liquidityEligible, themeKey: evidence.themeKey, evidenceVersion: evidence.evidenceVersion },
      decisionsPersisted: false, transactionsWritten: false, executionEnabled: false,
      message: "Hypothetical BUY research input only; not a persisted decision, execution authorization, allocation or transaction.",
    });
  } catch (error) {
    console.error("AG hypothetical sizing preview failed", { symbol, error });
    return json({ error: error instanceof Error ? error.message : "AG sizing preview failed.", symbol }, 500);
  }
}
