import { createClient } from "@/lib/supabase/server";
import { calculateAgEraAccounting } from "./era-accounting";
import { evaluateAgPortfolioGuardrails } from "./portfolio-guardrails";
import { sizeAgBuy } from "./risk-sizing";

export type ExecuteAgPaperBuyInput = {
  decisionId: string;
  price: number;
  // Risk-critical execution state is derived server-side. Callers may only
  // identify the decision and execution price.
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
    .select("id, portfolio_id, strategy_key, strategy_version, inception_at, reference_total_capital, execution_mode, ended_at")
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
  const currentAgMarketValue = Array.from(holdings.values()).reduce((sum, holding) => sum + holding.cost, 0);
  const currentPositionMarketValue = holdings.get(decision.ticker.toUpperCase())?.cost ?? 0;

  // V1 fail-closed risk state:
  // - Until persisted theme attribution exists, treat the entire AG sleeve as
  //   one theme. This is conservative and cannot understate theme exposure.
  // - Until authoritative HWM/drawdown state exists, execution is permitted
  //   only when the sleeve has no deployed exposure. Existing-position ADDs
  //   therefore fail closed rather than assuming a safe drawdown.
  // - Committee BUY persistence is the authoritative thesis/liquidity gate for
  //   a new starter. ADDs require a future persisted reassessment workflow.
  const currentThemeMarketValue = currentAgMarketValue;
  const hasExistingAgExposure = currentAgMarketValue > 0;
  const sleeveDrawdownPct = hasExistingAgExposure ? 100 : 0;
  const thesisValid = true;
  const liquidityEligible = true;
  const reassessmentComplete = false;

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
    price: input.price,
    committeeDecision: "BUY",
    liquidityEligible,
    thesisValid,
    isExistingPosition,
    allowAdd: isExistingPosition ? guardrails.addAllowed : undefined,
  });
  if (!sizing.eligible) throw new Error(`AG BUY sizing blocked: ${sizing.reasons.join(" ")}`);

  const grossAmount = Math.round(sizing.quantity * input.price * 100) / 100;
  const notes = `Accelerated Growth paper execution; decision ${decision.id}; ${sizing.version}; ${guardrails.version}`;
  const { data: atomicRows, error: atomicError } = await supabase.rpc("execute_ag_paper_buy_atomic", {
    p_decision_id: decision.id,
    p_quantity: sizing.quantity,
    p_price: input.price,
    p_gross_amount: grossAmount,
    p_notes: notes,
  });
  if (atomicError) throw new Error(`Unable to atomically record AG paper BUY: ${atomicError.message}`);

  const atomicResult = Array.isArray(atomicRows) ? atomicRows[0] : atomicRows;
  if (!atomicResult?.transaction_id) throw new Error("Atomic AG paper BUY returned no transaction linkage.");
  const transaction = { id: atomicResult.transaction_id };

  return { decisionId: decision.id, transactionId: transaction.id, ticker: decision.ticker, quantity: sizing.quantity, price: input.price, grossAmount, accountingBefore: accounting, guardrails, sizing };
}
