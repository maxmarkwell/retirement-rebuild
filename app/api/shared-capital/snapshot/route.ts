import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { previewSharedCapital } from "@/lib/portfolio/shared-capital";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

/** Read-only account reconciliation. No paper balances are counted as real cash. */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return respond({ error: "Authentication required." }, 401);

  try {
    const { data: portfolios, error: portfolioError } = await supabase.from("portfolios")
      .select("id, starting_capital, type, is_real_money")
      .eq("user_id", user.id).eq("is_real_money", true).eq("type", "real").limit(2);
    if (portfolioError || portfolios?.length !== 1) return respond({ error: "Exactly one real-money portfolio is required." }, 409);
    const portfolio = portfolios[0];

    const [contributions, transactions, eras] = await Promise.all([
      supabase.from("contributions").select("id, amount").eq("user_id", user.id).eq("portfolio_id", portfolio.id),
      supabase.from("transactions").select("id, transaction_type, gross_amount, fees")
        .eq("user_id", user.id).eq("portfolio_id", portfolio.id),
      supabase.from("portfolio_strategy_eras")
        .select("id, reference_total_capital").eq("user_id", user.id)
        .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
        .is("ended_at", null).limit(2),
    ]);
    if (contributions.error || transactions.error || eras.error) throw new Error("Unable to reconcile the full shared-capital ledger.");
    if (eras.data?.length !== 1) return respond({ error: "Exactly one open AG paper strategy era is required." }, 409);
    const unexpectedTransaction = (transactions.data ?? []).find(tx => tx.transaction_type !== "buy" && tx.transaction_type !== "sell");
    if (unexpectedTransaction) throw new Error("Unexpected real ledger transaction type. Manual reconciliation required.");

    // AG remains paper-only. No paper position is an actual account expenditure.
    const reference = Number(eras.data[0].reference_total_capital);
    const capital = previewSharedCapital({
      startingCapital: Number(portfolio.starting_capital),
      realContributions: (contributions.data ?? []).map(c => ({ id: c.id, amount: Number(c.amount) })),
      realTransactions: (transactions.data ?? []).map(tx => ({
        id: tx.id, transactionType: tx.transaction_type as "buy" | "sell",
        grossAmount: Number(tx.gross_amount), fees: Number(tx.fees ?? 0),
      })),
      agRiskCap: Math.floor(reference * 0.2 * 100) / 100,
      agRealMarketValue: 0,
    });
    return respond({
      version: "shared-capital-snapshot-v1", mode: "read_only",
      capital, contributionCount: contributions.data?.length ?? 0,
      transactionCount: transactions.data?.length ?? 0,
      accountSource: "real_portfolio_ledger", agExposureSource: "paper_only_zero_real_exposure",
      transactionsWritten: false, contributionsWritten: false,
      message: "Shared cash is derived from real-account records only. AG reference capital remains an independent risk basis pending reconciliation.",
    });
  } catch (error) {
    console.error("Shared capital snapshot error", error);
    return respond({ error: "Shared capital reconciliation unavailable. No records changed." }, 500);
  }
}
