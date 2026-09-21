import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "./era-accounting";
import { evaluateAgPortfolioGuardrails } from "./portfolio-guardrails";
import { sizeAgBuy } from "./risk-sizing";
import { valueAgSleeve } from "./valuation";
import { getMarketQuote } from "@/lib/market-data/twelve-data";

export type ExecuteAgPaperBuyInput = {
  decisionId: string;
  // The caller identifies only the Committee decision. Price, risk state,
  // sizing, and execution notional are derived server-side.
};

export async function executeAgPaperBuy(input: ExecuteAgPaperBuyInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: decision, error: decisionError } = await supabase
    .from("investment_decisions")
    .select("id, portfolio_id, transaction_id, decision_type, ticker, source, status, created_at")
    .eq("id", input.decisionId).eq("user_id", user.id).single();
  if (decisionError || !decision) throw new Error("Unable to load AG decision.");
  if (decision.source !== "ai_committee" || decision.decision_type !== "buy") throw new Error("Only AG Committee BUY decisions can use the AG paper executor.");
  if (decision.status !== "active" || decision.transaction_id) throw new Error("This AG BUY decision is not active or is already executed.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("id, type, is_real_money")
    .eq("id", decision.portfolio_id).eq("user_id", user.id).single();
  if (portfolioError || !portfolio || portfolio.type !== "paper_active" || portfolio.is_real_money) throw new Error("AG paper execution requires the paper_active portfolio.");

  const { data: era, error: eraError } = await supabase
    .from("portfolio_strategy_eras")
    .select("id, portfolio_id, strategy_key, strategy_version, inception_at, reference_total_capital, high_water_mark, execution_mode, ended_at")
    .eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth era is required.");
  if (new Date(decision.created_at).getTime() < new Date(era.inception_at).getTime()) throw new Error("Pre-inception decisions cannot execute inside the AG era.");

  const { data: transactions, error: txError } = await supabase
    .from("transactions").select("transaction_type, ticker, quantity, price_per_share, gross_amount, fees, created_at")
    .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
  if (txError) throw new Error(`Unable to load AG transactions: ${txError.message}`);

  const { data: contributions, error: contributionError } = await supabase
    .from("contributions").select("amount, created_at")
    .eq("portfolio_id", portfolio.id).gte("created_at", era.inception_at);
  if (contributionError) throw new Error(`Unable to load AG contributions: ${contributionError.message}`);

  const accounting = calculateAgEraAccounting(
    era,
    [
      ...(transactions ?? []).map((t) => ({
        type: t.transaction_type,
        total_amount: t.transaction_type === "buy"
          ? Number(t.gross_amount ?? 0) + Number(t.fees ?? 0)
          : Number(t.gross_amount ?? 0) - Number(t.fees ?? 0),
        created_at: t.created_at,
      })),
      ...(contributions ?? []).map((c) => ({
        type: "contribution",
        total_amount: Number(c.amount),
        created_at: c.created_at,
      })),
    ]
  );

  const holdings = new Map<string, { quantity: number; cost: number }>();
  for (const tx of transactions ?? []) {
    if (!tx.ticker || tx.quantity == null) continue;
    const ticker = tx.ticker.toUpperCase();
    const quantity = Number(tx.quantity);
    const gross = Number(tx.gross_amount ?? 0);
    const current = holdings.get(ticker) ?? { quantity: 0, cost: 0 };
    if (tx.transaction_type === "buy") {
      holdings.set(ticker, { quantity: current.quantity + quantity, cost: current.cost + gross + Number(tx.fees ?? 0) });
    } else if (tx.transaction_type === "sell" && current.quantity > 0) {
      const sold = Math.min(quantity, current.quantity);
      const averageCost = current.cost / current.quantity;
      holdings.set(ticker, { quantity: current.quantity - sold, cost: Math.max(0, current.cost - sold * averageCost) });
    }
  }
  const valuation = await valueAgSleeve({
    sleeveCap: accounting.sleeveCap,
    netDeployed: accounting.eraNetDeployed,
    holdings: Array.from(holdings.entries()).map(([ticker, holding]) => ({
      ticker,
      quantity: holding.quantity,
    })),
    persistedHighWaterMark: Number(era.high_water_mark ?? era.reference_total_capital),
  });

  // Exposure caps use live marked value, not cost basis.
  const currentAgMarketValue = valuation.holdingsMarketValue;
  const currentPositionHolding = holdings.get(decision.ticker.toUpperCase());
  const currentPositionPrice = valuation.prices[decision.ticker.toUpperCase()] ?? 0;
  const currentPositionMarketValue = currentPositionHolding
    ? Math.round(currentPositionHolding.quantity * currentPositionPrice * 100) / 100
    : 0;

  // Until persisted theme attribution exists, conservatively treat the whole
  // AG sleeve as one theme. Thesis/liquidity are established by Committee BUY
  // for a starter; ADDs still fail closed pending persisted reassessment.
  const currentThemeMarketValue = currentAgMarketValue;
  const sleeveDrawdownPct = valuation.drawdownPct;
  if (valuation.highWaterMark > Number(era.high_water_mark ?? 0)) {
    const { error: hwmError } = await supabase.rpc("advance_ag_high_water_mark", {
      p_era_id: era.id,
      p_current_equity: valuation.currentEquity,
    });
    if (hwmError) throw new Error(`Unable to advance AG high-water mark: ${hwmError.message}`);
  }

  const thesisValid = true;
  const liquidityEligible = true;
  const reassessmentComplete = false;

  // Never trust a browser/client supplied execution price. Resolve the
  // candidate's current market quote on the server immediately before sizing.
  const executionQuote = await getMarketQuote(decision.ticker.toUpperCase());
  const executionPrice = Number(executionQuote.price);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
    throw new Error("Unable to resolve a valid server-side AG execution price.");
  }

  const guardrails = evaluateAgPortfolioGuardrails({
    referenceTotalCapital: accounting.referenceTotalCapital,
    currentAgMarketValue,
    currentThemeMarketValue,
    currentPositionMarketValue,
    availableCash: accounting.eraCash,
    sleeveDrawdownPct,
    thesisValid,
    liquidityEligible,
    reassessmentComplete,
  });
  if (!guardrails.buyAllowed) throw new Error(`AG BUY blocked: ${guardrails.reasons.join(" ")}`);

  const isExistingPosition = currentPositionMarketValue > 0;
  const sizing = sizeAgBuy({
    referenceTotalCapital: accounting.referenceTotalCapital,
    availableCash: accounting.eraCash,
    currentAgMarketValue,
    currentPositionMarketValue,
    currentThemeMarketValue,
    price: executionPrice,
    committeeDecision: "BUY",
    liquidityEligible,
    thesisValid,
    isExistingPosition,
    allowAdd: isExistingPosition ? guardrails.addAllowed : undefined,
  });
  if (!sizing.eligible) throw new Error(`AG BUY sizing blocked: ${sizing.reasons.join(" ")}`);

  const grossAmount = Math.round(sizing.quantity * executionPrice * 100) / 100;
  const notes = `Accelerated Growth paper execution; decision ${decision.id}; ${sizing.version}; ${guardrails.version}`;
  const { data: atomicRows, error: atomicError } = await supabase.rpc("execute_ag_paper_buy_atomic", {
    p_decision_id: decision.id,
    p_quantity: sizing.quantity,
    p_price: executionPrice,
    p_gross_amount: grossAmount,
    p_notes: notes,
  });
  if (atomicError) throw new Error(`Unable to atomically record AG paper BUY: ${atomicError.message}`);

  const atomicResult = Array.isArray(atomicRows) ? atomicRows[0] : atomicRows;
  if (!atomicResult?.out_transaction_id) throw new Error("Atomic AG paper BUY returned no transaction linkage.");
  const transaction = { id: atomicResult.out_transaction_id };

  return { decisionId: decision.id, transactionId: transaction.id, ticker: decision.ticker, quantity: sizing.quantity, price: executionPrice, grossAmount, accountingBefore: accounting, valuation, guardrails, sizing };
}
