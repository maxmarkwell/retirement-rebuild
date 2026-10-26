import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "@/lib/discovery/accelerated-growth/era-accounting";
import { valueAgSleeve } from "@/lib/discovery/accelerated-growth/valuation";
import { calculateAgThemeMarketValue } from "@/lib/discovery/accelerated-growth/theme-exposure";
import { previewAgBuySizing } from "@/lib/discovery/accelerated-growth/buy-sizing-preflight";
import { getMarketQuote } from "@/lib/market-data/twelve-data";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const evidenceVersion = "ag-execution-evidence-v1+ag-liquidity-v1";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

/**
 * Authenticated, read-only inspection of an ALREADY PERSISTED AG Committee BUY.
 * No decision creation, high-water-mark update, authorization, transaction or RPC.
 * A research-only Committee preview (such as VRT) is NOT an eligible decision.
 */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) return json({ error: "A valid ticker symbol is required." }, 400);

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

    const { data: decisions, error: decisionError } = await supabase.from("investment_decisions")
      .select("id, portfolio_id, transaction_id, decision_type, ticker, source, status, created_at, ag_thesis_valid, ag_liquidity_eligible, ag_evidence_version, ag_theme_key")
      .eq("user_id", user.id).eq("portfolio_id", portfolio.id).eq("ticker", symbol)
      .eq("source", "ai_committee").eq("status", "active").gte("created_at", era.inception_at).limit(2);
    if (decisionError) throw new Error(`Unable to read AG decisions: ${decisionError.message}`);
    if ((decisions?.length ?? 0) > 1) return json({ version: "ag-buy-sizing-preview-v1", mode: "read_only", symbol, eligible: false, reasons: ["Multiple active AG decisions require reconciliation."], transactionsWritten: false, decisionsPersisted: false });
    const decision = decisions?.[0];
    if (!decision) return json({
      version: "ag-buy-sizing-preview-v1", mode: "read_only", symbol,
      eligible: false, reasons: ["No active persisted Committee decision exists in the current AG paper era."],
      transactionsWritten: false, decisionsPersisted: false, sizing: null,
    });

    // Fail closed before market-data reads when the decision cannot possibly execute.
    if (decision.decision_type !== "buy" || decision.transaction_id || decision.ag_thesis_valid !== true ||
        decision.ag_liquidity_eligible !== true || decision.ag_evidence_version !== evidenceVersion ||
        !decision.ag_theme_key) {
      return json({
        version: "ag-buy-sizing-preview-v1", mode: "read_only", symbol, eligible: false, sizing: null,
        reasons: ["Persisted decision is not an unexecuted BUY with current thesis, liquidity, and theme evidence."],
        transactionsWritten: false, decisionsPersisted: false,
      });
    }

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
      targetThemeKey: decision.ag_theme_key, holdings: openHoldings, prices: valuation.prices,
      transactions: transactions.map(t => ({ ticker: t.ticker, ag_theme_key: t.ag_theme_key })),
    });
    const quote = await getMarketQuote(symbol);
    const price = Number(quote.price);
    const holding = holdings.get(symbol);
    const positionMarketValue = holding && holding.quantity > 0
      ? Math.round(holding.quantity * (valuation.prices[symbol] ?? 0) * 100) / 100 : 0;

    const preflight = previewAgBuySizing({
      portfolioType: portfolio.type, isRealMoney: portfolio.is_real_money === true,
      strategyKey: era.strategy_key, executionMode: era.execution_mode, eraOpen: era.ended_at == null,
      decisionType: decision.decision_type, decisionSource: decision.source, decisionStatus: decision.status,
      decisionAlreadyExecuted: !!decision.transaction_id, decisionWithinEra: new Date(decision.created_at) >= new Date(era.inception_at),
      evidenceVersionValid: decision.ag_evidence_version === evidenceVersion,
      themeAttributionValid: !!decision.ag_theme_key, referenceTotalCapital: accounting.referenceTotalCapital,
      availableCash: accounting.eraCash, currentAgMarketValue: valuation.holdingsMarketValue,
      currentPositionMarketValue: positionMarketValue, currentThemeMarketValue: themeExposure,
      sleeveDrawdownPct: valuation.drawdownPct, price,
      liquidityEligible: decision.ag_liquidity_eligible === true, thesisValid: decision.ag_thesis_valid === true,
      reassessmentComplete: false,
    });

    return json({
      version: "ag-buy-sizing-preview-v1", mode: "read_only", symbol,
      eligible: preflight.eligible, reasons: preflight.reasons,
      guardrails: preflight.guardrails, sizing: preflight.sizing,
      portfolio: { type: portfolio.type, referenceTotalCapital: accounting.referenceTotalCapital,
        availableCash: accounting.eraCash, holdingsMarketValue: valuation.holdingsMarketValue,
        currentPositionMarketValue: positionMarketValue, currentThemeMarketValue: themeExposure,
        sleeveDrawdownPct: valuation.drawdownPct },
      quotePrice: price, decisionsPersisted: false, transactionsWritten: false, executionEnabled: false,
      message: "Non-binding snapshot only. Not a persisted allocation or transaction.",
    });
  } catch (error) {
    console.error("AG BUY sizing preview failed", { symbol, error });
    return json({ error: error instanceof Error ? error.message : "AG sizing preview failed.", symbol }, 500);
  }
}
