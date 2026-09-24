import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMarketQuote } from "@/lib/market-data/twelve-data";
import { calculateFifoPosition } from "@/lib/portfolio/fifo-accounting";

export type ExecuteAgPaperSellInput = {
  decisionId: string;
};

export async function executeAgPaperSell(input: ExecuteAgPaperSellInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: decision, error: decisionError } = await supabase.from("investment_decisions")
    .select("id, user_id, portfolio_id, transaction_id, decision_type, ticker, source, status, created_at, recommended_quantity")
    .eq("id", input.decisionId)
    .eq("user_id", user.id)
    .single();
  if (decisionError || !decision) throw new Error("Unable to load AG SELL decision.");
  if (decision.source !== "ai_committee" || decision.decision_type !== "sell") {
    throw new Error("Only AG Committee SELL decisions can use the AG paper SELL executor.");
  }
  if (decision.status !== "active" || decision.transaction_id) {
    throw new Error("This AG SELL decision is not active or is already executed.");
  }

  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id, type, is_real_money")
    .eq("id", decision.portfolio_id)
    .eq("user_id", user.id)
    .single();
  if (portfolioError || !portfolio || portfolio.type !== "paper_active" || portfolio.is_real_money) {
    throw new Error("AG paper SELL execution requires the paper_active portfolio.");
  }

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id, portfolio_id, strategy_key, inception_at, execution_mode, ended_at")
    .eq("portfolio_id", portfolio.id)
    .eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper")
    .is("ended_at", null)
    .single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth era is required.");
  if (new Date(decision.created_at).getTime() < new Date(era.inception_at).getTime()) {
    throw new Error("Pre-inception decisions cannot execute inside the AG era.");
  }

  const { data: transactions, error: txError } = await supabase.from("transactions")
    .select("id, transaction_type, ticker, quantity, price_per_share, fees, transaction_date, created_at")
    .eq("portfolio_id", portfolio.id)
    .eq("ticker", decision.ticker.toUpperCase())
    .gte("transaction_date", era.inception_at)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (txError) throw new Error(`Unable to load AG position ledger: ${txError.message}`);

  const fifo = calculateFifoPosition(transactions ?? []);
  if (fifo.sharesOwned <= 0) throw new Error(`There is no post-inception AG ${decision.ticker} position to sell.`);

  // V1 SELL semantics: a Committee SELL exits the full AG-era position unless
  // the decision explicitly persists a smaller positive quantity.
  const recommended = decision.recommended_quantity == null ? null : Number(decision.recommended_quantity);
  const quantity = recommended != null && Number.isFinite(recommended) && recommended > 0
    ? recommended
    : fifo.sharesOwned;
  if (quantity - fifo.sharesOwned > 1e-8) {
    throw new Error(`AG SELL quantity ${quantity} exceeds post-inception holdings ${fifo.sharesOwned}.`);
  }

  const quote = await getMarketQuote(decision.ticker.toUpperCase());
  const executionPrice = Number(quote.price);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
    throw new Error("Unable to resolve a valid server-side AG SELL execution price.");
  }

  const admin = createAdminClient();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const { data: authorization, error: authorizationError } = await admin
    .from("ag_sell_execution_authorizations")
    .insert({
      user_id: user.id,
      portfolio_id: portfolio.id,
      strategy_era_id: era.id,
      decision_id: decision.id,
      ticker: decision.ticker.toUpperCase(),
      quantity,
      price_per_share: executionPrice,
      fees: 0,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (authorizationError || !authorization) {
    throw new Error(`Unable to authorize AG paper SELL: ${authorizationError?.message ?? "Unknown authorization error."}`);
  }

  const { data: atomicRows, error: atomicError } = await admin.rpc("execute_ag_paper_sell_authorized", {
    p_authorization_id: authorization.id,
  });
  if (atomicError) throw new Error(`Unable to atomically execute authorized AG paper SELL: ${atomicError.message}`);

  const result = Array.isArray(atomicRows) ? atomicRows[0] : atomicRows;
  if (!result?.transaction_id) throw new Error("Authorized AG paper SELL returned no transaction linkage.");

  return {
    decisionId: decision.id,
    transactionId: result.transaction_id,
    authorizationId: authorization.id,
    ticker: decision.ticker.toUpperCase(),
    quantity: Number(result.quantity),
    price: Number(result.price_per_share),
    grossAmount: Number(result.gross_amount),
    fees: Number(result.fees),
    netProceeds: Number(result.net_proceeds),
    costBasis: Number(result.cost_basis),
    realizedGainLoss: Number(result.realized_gain_loss),
    sharesOwnedBefore: Number(result.shares_owned_before),
    sharesOwnedAfter: Number(result.shares_owned_after),
  };
}
