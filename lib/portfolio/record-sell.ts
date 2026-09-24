import { createClient } from "@/lib/supabase/server";
import { calculateFifoPosition } from "@/lib/portfolio/fifo-accounting";

type RecordSellInput = {
  portfolioId: string;
  ticker: string;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  transactionDate: string;
  notes?: string | null;
};

export async function recordSellTransaction(input: RecordSellInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const ticker = input.ticker.trim().toUpperCase();
  const quantity = Number(input.quantity);
  const pricePerShare = Number(input.pricePerShare);
  const fees = Number(input.fees ?? 0);

  if (!input.portfolioId) throw new Error("Portfolio is required.");
  if (!ticker) throw new Error("Ticker is required.");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be greater than zero.");
  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) throw new Error("Price per share must be greater than zero.");
  if (!Number.isFinite(fees) || fees < 0) throw new Error("Fees cannot be negative.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", input.portfolioId)
    .eq("user_id", user.id)
    .single();
  if (portfolioError || !portfolio) throw new Error("Unable to load the selected portfolio.");

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id, transaction_type, ticker, quantity, price_per_share, fees, transaction_date, created_at")
    .eq("portfolio_id", input.portfolioId)
    .eq("ticker", ticker)
    .order("transaction_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (transactionsError) throw new Error(`Unable to calculate current holdings: ${transactionsError.message}`);

  const fifo = calculateFifoPosition(transactions ?? [], quantity);
  const sharesOwned = fifo.sharesOwned;
  if (sharesOwned <= 0) throw new Error(`There is no ${ticker} position available to sell.`);
  if (quantity - sharesOwned > 1e-8) {
    throw new Error(`Insufficient shares. Current position is ${sharesOwned.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${ticker}, but this sale requests ${quantity.toLocaleString("en-US", { maximumFractionDigits: 8 })}.`);
  }

  const grossAmount = quantity * pricePerShare;
  const netProceeds = grossAmount - fees;
  if (netProceeds < 0) throw new Error("Transaction fees cannot exceed sale proceeds.");

  const costBasis = fifo.sellCostBasis ?? 0;
  const realizedGainLoss = netProceeds - costBasis;

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      portfolio_id: input.portfolioId,
      transaction_type: "sell",
      ticker,
      quantity,
      price_per_share: pricePerShare,
      gross_amount: grossAmount,
      fees,
      transaction_date: input.transactionDate,
      notes: input.notes ?? null,
      cost_basis: costBasis,
      realized_gain_loss: realizedGainLoss,
      lot_method: "fifo",
    })
    .select("id")
    .single();
  if (transactionError || !transaction) {
    throw new Error(`Unable to record transaction: ${transactionError?.message ?? "Unknown error"}`);
  }

  return {
    transactionId: transaction.id,
    ticker,
    quantity,
    pricePerShare,
    grossAmount,
    fees,
    netProceeds,
    costBasis,
    realizedGainLoss,
    lotMethod: "fifo" as const,
    consumedLots: fifo.consumedLots ?? [],
    sharesOwnedBefore: sharesOwned,
    sharesOwnedAfter: sharesOwned - quantity,
    remainingCostBasisAfter: Math.max(0, fifo.remainingCostBasis - costBasis),
  };
}
