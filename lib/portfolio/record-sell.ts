import { createClient } from "@/lib/supabase/server";

type RecordSellInput = {
  portfolioId: string;
  ticker: string;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  transactionDate: string;
  notes?: string | null;
};

export async function recordSellTransaction(
  input: RecordSellInput
) {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "You must be signed in."
    );
  }

  const ticker =
    input.ticker
      .trim()
      .toUpperCase();

  const quantity =
    Number(input.quantity);

  const pricePerShare =
    Number(input.pricePerShare);

  const fees =
    Number(input.fees ?? 0);

  if (!input.portfolioId) {
    throw new Error(
      "Portfolio is required."
    );
  }

  if (!ticker) {
    throw new Error(
      "Ticker is required."
    );
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      "Quantity must be greater than zero."
    );
  }

  if (
    !Number.isFinite(
      pricePerShare
    ) ||
    pricePerShare <= 0
  ) {
    throw new Error(
      "Price per share must be greater than zero."
    );
  }

  if (
    !Number.isFinite(fees) ||
    fees < 0
  ) {
    throw new Error(
      "Fees cannot be negative."
    );
  }

  // ---------------------------------------------------------
  // Confirm portfolio exists
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } =
    await supabase
      .from("portfolios")
      .select("id")
      .eq(
        "id",
        input.portfolioId
      )
      .single();

  if (
    portfolioError ||
    !portfolio
  ) {
    throw new Error(
      "Unable to load the selected portfolio."
    );
  }

  // ---------------------------------------------------------
  // Calculate current shares owned
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } =
    await supabase
      .from("transactions")
      .select(
        "transaction_type, ticker, quantity"
      )
      .eq(
        "portfolio_id",
        input.portfolioId
      );

  if (
    transactionsError
  ) {
    throw new Error(
      `Unable to calculate current holdings: ${transactionsError.message}`
    );
  }

  let sharesOwned = 0;

  for (
    const transaction
    of transactions ?? []
  ) {
    const transactionTicker =
      transaction.ticker
        ?.trim()
        .toUpperCase();

    if (
      transactionTicker !==
      ticker
    ) {
      continue;
    }

    const transactionQuantity =
      Number(
        transaction.quantity ??
          0
      );

    if (
      transaction.transaction_type ===
      "buy"
    ) {
      sharesOwned +=
        transactionQuantity;
    }

    if (
      transaction.transaction_type ===
      "sell"
    ) {
      sharesOwned -=
        transactionQuantity;
    }
  }

  // ---------------------------------------------------------
  // Position guardrail
  // ---------------------------------------------------------

  if (
    sharesOwned <= 0
  ) {
    throw new Error(
      `There is no ${ticker} position available to sell.`
    );
  }

  if (
    quantity >
    sharesOwned
  ) {
    throw new Error(
      `Insufficient shares. Current position is ${sharesOwned.toLocaleString(
        "en-US",
        {
          maximumFractionDigits:
            4,
        }
      )} ${ticker}, but this sale requests ${quantity.toLocaleString(
        "en-US",
        {
          maximumFractionDigits:
            4,
        }
      )}.`
    );
  }

  // ---------------------------------------------------------
  // Calculate proceeds
  // ---------------------------------------------------------

  const grossAmount =
    quantity *
    pricePerShare;

  const netProceeds =
    grossAmount -
    fees;

  if (
    netProceeds < 0
  ) {
    throw new Error(
      "Transaction fees cannot exceed sale proceeds."
    );
  }

  // ---------------------------------------------------------
  // Record transaction
  // ---------------------------------------------------------

  const {
    data: transaction,
    error: transactionError,
  } =
    await supabase
      .from("transactions")
      .insert({
        user_id:
          user.id,

        portfolio_id:
          input.portfolioId,

        transaction_type:
          "sell",

        ticker,

        quantity,

        price_per_share:
          pricePerShare,

        gross_amount:
          grossAmount,

        fees,

        transaction_date:
          input.transactionDate,

        notes:
          input.notes ??
          null,
      })
      .select("id")
      .single();

  if (
    transactionError ||
    !transaction
  ) {
    throw new Error(
      `Unable to record transaction: ${
        transactionError?.message ??
        "Unknown error"
      }`
    );
  }

  return {
    transactionId:
      transaction.id,

    ticker,

    quantity,

    pricePerShare,

    grossAmount,

    fees,

    netProceeds,

    sharesOwnedBefore:
      sharesOwned,

    sharesOwnedAfter:
      sharesOwned -
      quantity,
  };
}