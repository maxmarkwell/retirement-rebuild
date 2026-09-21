import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateAgEraAccounting } from "./era-accounting";
import { evaluateAgPortfolioGuardrails } from "./portfolio-guardrails";
import { sizeAgBuy } from "./risk-sizing";
import { valueAgSleeve } from "./valuation";
import { getMarketQuote } from "@/lib/market-data/twelve-data";

export type ExecuteAgPaperBuyInput = { decisionId: string };

export async function executeAgPaperBuy(input: ExecuteAgPaperBuyInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: decision, error: decisionError } = await supabase.from("investment_decisions")
    .select("id, portfolio_id, transaction_id, decision_type, ticker, source, status, created_at, ag_thesis_valid, ag_liquidity_eligible, ag_evidence_version")
    .eq("id", input.decisionId).eq("user_id", user.id).single();
  if (decisionError || !decision) throw new Error("Unable to load AG decision.");
  if (decision.source !== "ai_committee" || decision.decision_type !== "buy") throw new Error("Only AG Committee BUY decisions can use the AG paper executor.");
  if (decision.status !== "active" || decision.transaction_id) throw new Error("This AG BUY decision is not active or is already executed.");

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id, type, is_real_money").eq("id", decision.portfolio_id).eq("user_id", user.id).single();
  if (portfolioError || !portfolio || portfolio.type !== "paper_active" || portfolio.is_real_money) throw new Error("AG paper execution requires the paper_active portfolio.");

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id, portfolio_id, strategy_key, strategy_version, inception_at, reference_total_capital, high_water_mark, execution_mode, ended_at")
    .eq("portfolio_id", portfolio.id).eq("user_id", user.id).eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper").is("ended_at", null).single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth era is required.");
  if (new Date(decision.created_at).getTime() < new Date(era.inception_at).getTime()) throw new Error("Pre-inception decisions cannot execute inside the AG era.");

  const { data: transactions, error: txError } = await supabase.from("transactions")
    .select("transaction_type, ticker, quantity, price_per_share, gross_amount, fees, created_at")
    .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
  if (txError) throw new Error(`Unable to load AG transactions: ${txError.message}`);
  const { data: contributions, error: contributionError } = await supabase.from("contributions")
    .select("amount, created_at").eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
  if (contributionError) throw new Error(`Unable to load AG contributions: ${contributionError.message}`);

  const accounting = calculateAgEraAccounting(era, [
    ...(transactions ?? []).map((t) => ({
      type: t.transaction_type,
      total_amount: t.transaction_type === "buy" ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0) : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
      created_at: t.created_at,
    })),
    ...(contributions ?? []).map((x) => ({ type: "contribution", total_amount: Number(x.amount), created_at: x.created_at })),
  ]);

  const holdings = new Map<string, { quantity: number; cost: number }>();
  for (const tx of transactions ?? []) {
    if (!tx.ticker || tx.quantity == null) continue;
    const ticker = tx.ticker.toUpperCase(), quantity = Number(tx.quantity), gross = Number(tx.gross_amount ?? 0);
    const current = holdings.get(ticker) ?? { quantity: 0, cost: 0 };
    if (tx.transaction_type === "buy") holdings.set(ticker, { quantity: current.quantity + quantity, cost: current.cost + gross + Number(tx.fees ?? 0) });
    else if (tx.transaction_type === "sell" && current.quantity > 0) {
      const sold = Math.min(quantity, current.quantity), averageCost = current.cost / current.quantity;
      holdings.set(ticker, { quantity: current.quantity - sold, cost: Math.max(0, current.cost - sold * averageCost) });
    }
  }

  const valuation = await valueAgSleeve({
    sleeveCap: accounting.sleeveCap, netDeployed: accounting.eraNetDeployed,
    holdings: Array.from(holdings.entries()).map(([ticker, h]) => ({ ticker, quantity: h.quantity })),
    persistedHighWaterMark: Number(era.high_water_mark ?? era.reference_total_capital),
  });
  const currentAgMarketValue = valuation.holdingsMarketValue;
  const currentPositionHolding = holdings.get(decision.ticker.toUpperCase());
  const currentPositionPrice = valuation.prices[decision.ticker.toUpperCase()] ?? 0;
  const currentPositionMarketValue = currentPositionHolding ? Math.round(currentPositionHolding.quantity * currentPositionPrice * 100) / 100 : 0;
  const currentThemeMarketValue = currentAgMarketValue;
  const sleeveDrawdownPct = valuation.drawdownPct;

  if (valuation.highWaterMark > Number(era.high_water_mark ?? 0)) {
    const hwmAdmin = createAdminClient();
    const { error: hwmError } = await hwmAdmin.rpc("advance_ag_high_water_mark", { p_era_id: era.id, p_current_equity: valuation.currentEquity });
    if (hwmError) throw new Error(`Unable to advance AG high-water mark: ${hwmError.message}`);
  }

  if (decision.ag_evidence_version !== "ag-execution-evidence-v1" || decision.ag_thesis_valid !== true || decision.ag_liquidity_eligible !== true) {
    throw new Error("AG BUY lacks persisted thesis/liquidity execution evidence.");
  }

  const executionQuote = await getMarketQuote(decision.ticker.toUpperCase());
  const executionPrice = Number(executionQuote.price);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new Error("Unable to resolve a valid server-side AG execution price.");

  const guardrails = evaluateAgPortfolioGuardrails({
    referenceTotalCapital: accounting.referenceTotalCapital, currentAgMarketValue, currentThemeMarketValue,
    currentPositionMarketValue, availableCash: accounting.eraCash, sleeveDrawdownPct,
    thesisValid: decision.ag_thesis_valid, liquidityEligible: decision.ag_liquidity_eligible, reassessmentComplete: false,
  });
  if (!guardrails.buyAllowed) throw new Error(`AG BUY blocked: ${guardrails.reasons.join(" ")}`);

  const isExistingPosition = currentPositionMarketValue > 0;
  const sizing = sizeAgBuy({
    referenceTotalCapital: accounting.referenceTotalCapital, availableCash: accounting.eraCash,
    currentAgMarketValue, currentPositionMarketValue, currentThemeMarketValue, price: executionPrice,
    committeeDecision: "BUY", liquidityEligible: decision.ag_liquidity_eligible, thesisValid: decision.ag_thesis_valid, isExistingPosition,
    allowAdd: isExistingPosition ? guardrails.addAllowed : undefined,
  });
  if (!sizing.eligible) throw new Error(`AG BUY sizing blocked: ${sizing.reasons.join(" ")}`);

  const grossAmount = Math.round(sizing.quantity * executionPrice * 100) / 100;
  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  // Only the trusted server/service role can mint an authorization. The
  // end-user role has no RLS policy on this table and cannot consume the RPC.
  const { data: authorization, error: authorizationError } = await admin
    .from("ag_execution_authorizations")
    .insert({
      user_id: user.id, portfolio_id: portfolio.id, decision_id: decision.id,
      ticker: decision.ticker.toUpperCase(), quantity: sizing.quantity,
      price: executionPrice, gross_amount: grossAmount, expires_at: expiresAt,
    }).select("id").single();
  if (authorizationError || !authorization) throw new Error(`Unable to authorize AG paper BUY: ${authorizationError?.message ?? "Unknown authorization error."}`);

  const { data: atomicRows, error: atomicError } = await admin.rpc("execute_ag_paper_buy_authorized", {
    p_authorization_id: authorization.id,
  });
  if (atomicError) throw new Error(`Unable to atomically record authorized AG paper BUY: ${atomicError.message}`);

  const atomicResult = Array.isArray(atomicRows) ? atomicRows[0] : atomicRows;
  if (!atomicResult?.out_transaction_id) throw new Error("Authorized AG paper BUY returned no transaction linkage.");

  return {
    decisionId: decision.id, transactionId: atomicResult.out_transaction_id, authorizationId: authorization.id,
    ticker: decision.ticker, quantity: sizing.quantity, price: executionPrice, grossAmount,
    accountingBefore: accounting, valuation, guardrails, sizing,
  };
}
