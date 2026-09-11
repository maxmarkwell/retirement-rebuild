import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const {
    data: decision,
    error: decisionError,
  } = await supabase
    .from("investment_decisions")
    .select("id, portfolio_id, ticker")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (decisionError || !decision) {
    return NextResponse.json(
      { error: "Decision not found." },
      { status: 404 }
    );
  }

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select("transaction_type, ticker, quantity")
    .eq("portfolio_id", decision.portfolio_id)
    .eq("ticker", decision.ticker);

  if (transactionsError) {
    console.error(
      `Unable to load current ${decision.ticker} position:`,
      transactionsError
    );

    return NextResponse.json(
      { error: "Unable to load current position." },
      { status: 500 }
    );
  }

  const quantity = (transactions ?? []).reduce(
    (total, transaction) => {
      const shares = Number(transaction.quantity);

      if (!Number.isFinite(shares)) {
        return total;
      }

      const transactionType =
        transaction.transaction_type
          ?.trim()
          .toLowerCase();

      if (transactionType === "buy") {
        return total + shares;
      }

      if (transactionType === "sell") {
        return total - shares;
      }

      return total;
    },
    0
  );

  return NextResponse.json({
    ticker: decision.ticker,
    quantity: Math.max(0, quantity),
    hasPosition: quantity > 0,
  });
}
