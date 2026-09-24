"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordBuyTransaction } from "@/lib/portfolio/record-buy";
import { recordSellTransaction } from "@/lib/portfolio/record-sell";
import type { ActionState } from "@/lib/forms/action-state";

function parseExecution(formData: FormData) {
  const decisionId = String(formData.get("decision_id") ?? "");
  const quantity = Number(formData.get("quantity"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const fees = Number(formData.get("fees") ?? 0);
  const transactionDateRaw = String(formData.get("transaction_date") ?? "");
  return { decisionId, quantity, pricePerShare, fees, transactionDateRaw };
}

function validateExecution(input: ReturnType<typeof parseExecution>, verb: "purchased" | "sold"): ActionState | null {
  if (!input.decisionId) return { success: false, message: "Decision ID is required." };
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { success: false, message: `Actual shares ${verb} must be greater than zero.` };
  if (!Number.isFinite(input.pricePerShare) || input.pricePerShare <= 0) return { success: false, message: "Actual price per share must be greater than zero." };
  if (!Number.isFinite(input.fees) || input.fees < 0) return { success: false, message: "Fees cannot be negative." };
  if (!input.transactionDateRaw) return { success: false, message: "Execution date and time are required." };
  const transactionDate = new Date(input.transactionDateRaw);
  if (Number.isNaN(transactionDate.getTime())) return { success: false, message: "Execution date and time are invalid." };
  return null;
}

async function loadRealDecision(decisionId: string, decisionType: "buy" | "sell") {
  const supabase = await createClient();
  const { data: decision, error: decisionError } = await supabase
    .from("investment_decisions")
    .select("id, portfolio_id, transaction_id, decision_type, ticker, status")
    .eq("id", decisionId)
    .single();
  if (decisionError || !decision) throw new Error("Unable to load the investment decision.");
  if (decision.transaction_id || decision.status === "executed") throw new Error("This decision has already been executed.");
  if (decision.decision_type !== decisionType) throw new Error(`Only ${decisionType.toUpperCase()} decisions can be recorded with this action.`);

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, name, is_real_money")
    .eq("id", decision.portfolio_id)
    .single();
  if (portfolioError || !portfolio) throw new Error("Unable to load the selected portfolio.");
  if (!portfolio.is_real_money) throw new Error("This action can only be used for a real-money portfolio.");
  return { supabase, decision };
}

function revalidateDecision(decisionId: string) {
  revalidatePath("/");
  revalidatePath("/decisions");
  revalidatePath(`/decisions/${decisionId}`);
  revalidatePath("/performance");
  revalidatePath("/activity");
}

export async function recordRealMoneyBuy(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "You must be signed in." };

  const input = parseExecution(formData);
  const validation = validateExecution(input, "purchased");
  if (validation) return validation;

  try {
    const { supabase: db, decision } = await loadRealDecision(input.decisionId, "buy");
    const transactionDate = new Date(input.transactionDateRaw);
    const transaction = await recordBuyTransaction({
      portfolioId: decision.portfolio_id,
      ticker: decision.ticker,
      quantity: input.quantity,
      pricePerShare: input.pricePerShare,
      fees: input.fees,
      transactionDate: transactionDate.toISOString(),
      notes: `Actual brokerage BUY recorded for real-money investment decision ${decision.id}.`,
    });
    const { error } = await db.from("investment_decisions").update({ transaction_id: transaction.transactionId, status: "executed" }).eq("id", decision.id);
    if (error) throw new Error(`Transaction was recorded, but the decision could not be linked: ${error.message}`);
    revalidateDecision(decision.id);
    return { success: true, message: `Actual brokerage purchase recorded: ${input.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${decision.ticker} at $${input.pricePerShare.toFixed(2)}.` };
  } catch (error) {
    return { success: false, message: `Recording failed: ${error instanceof Error ? error.message : "Unable to record actual brokerage purchase."}` };
  }
}

export async function recordRealMoneySell(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: "You must be signed in." };

  const input = parseExecution(formData);
  const validation = validateExecution(input, "sold");
  if (validation) return validation;

  try {
    const { supabase: db, decision } = await loadRealDecision(input.decisionId, "sell");
    const transactionDate = new Date(input.transactionDateRaw);
    const transaction = await recordSellTransaction({
      portfolioId: decision.portfolio_id,
      ticker: decision.ticker,
      quantity: input.quantity,
      pricePerShare: input.pricePerShare,
      fees: input.fees,
      transactionDate: transactionDate.toISOString(),
      notes: `Actual brokerage SELL recorded for real-money investment decision ${decision.id}.`,
    });
    const { error } = await db.from("investment_decisions").update({ transaction_id: transaction.transactionId, status: "executed" }).eq("id", decision.id);
    if (error) throw new Error(`Transaction was recorded, but the decision could not be linked: ${error.message}`);
    revalidateDecision(decision.id);
    return {
      success: true,
      message: `Actual brokerage sale recorded: ${input.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${decision.ticker} at $${input.pricePerShare.toFixed(2)}. FIFO basis ${transaction.costBasis.toLocaleString("en-US", { style: "currency", currency: "USD" })}; realized P/L ${transaction.realizedGainLoss.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
    };
  } catch (error) {
    return { success: false, message: `Recording failed: ${error instanceof Error ? error.message : "Unable to record actual brokerage sale."}` };
  }
}
