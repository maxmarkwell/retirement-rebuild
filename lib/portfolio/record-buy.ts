import { createClient } from "@/lib/supabase/server";

type RecordBuyInput = {
  portfolioId: string;
  ticker: string;
  quantity: number;
  pricePerShare: number;
  fees?: number;
  transactionDate: string;
  notes?: string | null;
};

export async function recordBuyTransaction(
  input: RecordBuyInput
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    !Number.isFinite(pricePerShare) ||
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

  const grossAmount =
    quantity * pricePerShare;

  const totalPurchaseCost =
    grossAmount + fees;

  // ---------------------------------------------------------
  // Load portfolio
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } = await supabase
    .from("portfolios")
    .select(
      "id, starting_capital"
    )
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
  // Load contributions
  // ---------------------------------------------------------

  const {
    data: contributions,
    error: contributionsError,
  } = await supabase
    .from("contributions")
    .select("amount")
    .eq(
      "portfolio_id",
      input.portfolioId
    );

  if (contributionsError) {
    throw new Error(
      `Unable to calculate contributions: ${contributionsError.message}`
    );
  }

  const totalContributions =
    contributions?.reduce(
      (
        total,
        contribution
      ) =>
        total +
        Number(
          contribution.amount
        ),
      0
    ) ?? 0;

  // ---------------------------------------------------------
  // Load existing transactions
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "transaction_type, gross_amount, fees"
    )
    .eq(
      "portfolio_id",
      input.portfolioId
    );

  if (transactionsError) {
    throw new Error(
      `Unable to calculate transactions: ${transactionsError.message}`
    );
  }

  let totalBuys = 0;
  let totalSellProceeds = 0;

  transactions?.forEach(
    (transaction) => {
      const gross =
        Number(
          transaction.gross_amount ??
            0
        );

      const transactionFees =
        Number(
          transaction.fees ??
            0
        );

      if (
        transaction.transaction_type ===
        "buy"
      ) {
        totalBuys +=
          gross +
          transactionFees;
      }

      if (
        transaction.transaction_type ===
        "sell"
      ) {
        totalSellProceeds +=
          gross -
          transactionFees;
      }
    }
  );

  const availableCash =
    Number(
      portfolio.starting_capital
    ) +
    totalContributions -
    totalBuys +
    totalSellProceeds;

  // ---------------------------------------------------------
  // Cash guardrail
  // ---------------------------------------------------------

  if (
    totalPurchaseCost >
    availableCash
  ) {
    throw new Error(
      `Insufficient cash. Available cash is $${availableCash.toFixed(
        2
      )}, but this purchase would cost $${totalPurchaseCost.toFixed(
        2
      )}.`
    );
  }

  // ---------------------------------------------------------
  // Record transaction
  // ---------------------------------------------------------

  const {
    data: transaction,
    error: transactionError,
  } = await supabase
    .from("transactions")
    .insert({
      user_id:
        user.id,

      portfolio_id:
        input.portfolioId,

      transaction_type:
        "buy",

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

    totalPurchaseCost,

    availableCashBefore:
      availableCash,

    availableCashAfter:
      availableCash -
      totalPurchaseCost,
  };
}