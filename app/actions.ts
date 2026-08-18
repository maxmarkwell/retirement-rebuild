"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/lib/forms/action-state";

// ---------------------------------------------------------
// CONTRIBUTION
// ---------------------------------------------------------

export async function addContribution(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "You must be signed in.",
    };
  }

  const portfolioId = formData.get("portfolio_id") as string;
  const amount = Number(formData.get("amount"));
  const contributionDate = formData.get("contribution_date") as string;
  const notes = formData.get("notes") as string;

  if (!portfolioId) {
    return {
      success: false,
      message: "Portfolio is required.",
    };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      success: false,
      message: "Contribution amount must be greater than zero.",
    };
  }

  if (!contributionDate) {
    return {
      success: false,
      message: "Contribution date is required.",
    };
  }

  const { error } = await supabase.from("contributions").insert({
    user_id: user.id,
    portfolio_id: portfolioId,
    amount,
    contribution_date: contributionDate,
    notes: notes || null,
  });

  if (error) {
    throw new Error(`Unable to add contribution: ${error.message}`);
  }

  revalidatePath("/");

  return {
    success: true,
    message: `Contribution recorded successfully: $${amount.toFixed(2)}.`,
  };
}

// ---------------------------------------------------------
// BUY
// ---------------------------------------------------------

export async function addBuyTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "You must be signed in.",
    };
  }

  const portfolioId = formData.get("portfolio_id") as string;

  const ticker = (formData.get("ticker") as string)
    ?.trim()
    .toUpperCase();

  const quantity = Number(formData.get("quantity"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const fees = Number(formData.get("fees") || 0);
  const transactionDate = formData.get("transaction_date") as string;
  const notes = formData.get("notes") as string;

  if (!portfolioId || !ticker || !transactionDate) {
    return {
      success: false,
      message: "Portfolio, ticker, and transaction date are required.",
    };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      success: false,
      message: "Quantity must be greater than zero.",
    };
  }

  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    return {
      success: false,
      message: "Price per share must be greater than zero.",
    };
  }

  if (!Number.isFinite(fees) || fees < 0) {
    return {
      success: false,
      message: "Fees cannot be negative.",
    };
  }

  const transactionDateUtc = fromZonedTime(
    transactionDate,
    "America/Denver"
  ).toISOString();

  const grossAmount = quantity * pricePerShare;
  const totalPurchaseCost = grossAmount + fees;

  // ---------------------------------------------------------
  // Load portfolio
  // ---------------------------------------------------------

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, starting_capital")
    .eq("id", portfolioId)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Unable to load the selected portfolio.");
  }

  // ---------------------------------------------------------
  // Calculate contributions
  // ---------------------------------------------------------

  const { data: contributions, error: contributionsError } =
    await supabase
      .from("contributions")
      .select("amount")
      .eq("portfolio_id", portfolioId);

  if (contributionsError) {
    throw new Error(
      `Unable to calculate contributions: ${contributionsError.message}`
    );
  }

  const totalContributions =
    contributions?.reduce(
      (total, contribution) =>
        total + Number(contribution.amount),
      0
    ) ?? 0;

  // ---------------------------------------------------------
  // Calculate cash used/returned by prior transactions
  // ---------------------------------------------------------

  const { data: transactions, error: transactionsError } =
    await supabase
      .from("transactions")
      .select("transaction_type, gross_amount, fees")
      .eq("portfolio_id", portfolioId);

  if (transactionsError) {
    throw new Error(
      `Unable to calculate transactions: ${transactionsError.message}`
    );
  }

  let totalBuys = 0;
  let totalSellProceeds = 0;

  transactions?.forEach((transaction) => {
    const gross = Number(transaction.gross_amount ?? 0);
    const transactionFees = Number(transaction.fees ?? 0);

    if (transaction.transaction_type === "buy") {
      totalBuys += gross + transactionFees;
    }

    if (transaction.transaction_type === "sell") {
      totalSellProceeds += gross - transactionFees;
    }
  });

  const availableCash =
    Number(portfolio.starting_capital) +
    totalContributions -
    totalBuys +
    totalSellProceeds;

  // ---------------------------------------------------------
  // Cash guardrail
  // ---------------------------------------------------------

  if (totalPurchaseCost > availableCash) {
    return {
      success: false,
      message:
        `Insufficient cash. Available cash is $${availableCash.toFixed(2)}, ` +
        `but this purchase would cost $${totalPurchaseCost.toFixed(2)}.`,
    };
  }

  // ---------------------------------------------------------
  // Record buy
  // ---------------------------------------------------------

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    portfolio_id: portfolioId,
    transaction_type: "buy",
    ticker,
    quantity,
    price_per_share: pricePerShare,
    gross_amount: grossAmount,
    fees,
    transaction_date: transactionDateUtc,
    notes: notes || null,
  });

  if (error) {
    throw new Error(`Unable to record transaction: ${error.message}`);
  }

  revalidatePath("/");

  return {
    success: true,
    message: `Buy recorded successfully: ${quantity} ${ticker} at $${pricePerShare.toFixed(
      2
    )}.`,
  };
}

// ---------------------------------------------------------
// SELL
// ---------------------------------------------------------

export async function addSellTransaction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      message: "You must be signed in.",
    };
  }

  const portfolioId = formData.get("portfolio_id") as string;

  const ticker = (formData.get("ticker") as string)
    ?.trim()
    .toUpperCase();

  const quantity = Number(formData.get("quantity"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const fees = Number(formData.get("fees") || 0);
  const transactionDate = formData.get("transaction_date") as string;
  const notes = formData.get("notes") as string;

  if (!portfolioId || !ticker || !transactionDate) {
    return {
      success: false,
      message: "Portfolio, ticker, and transaction date are required.",
    };
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      success: false,
      message: "Quantity must be greater than zero.",
    };
  }

  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    return {
      success: false,
      message: "Sale price per share must be greater than zero.",
    };
  }

  if (!Number.isFinite(fees) || fees < 0) {
    return {
      success: false,
      message: "Fees cannot be negative.",
    };
  }

  const transactionDateUtc = fromZonedTime(
    transactionDate,
    "America/Denver"
  ).toISOString();

  // ---------------------------------------------------------
  // Calculate shares currently owned
  // ---------------------------------------------------------

  const { data: transactions, error: transactionsError } =
    await supabase
      .from("transactions")
      .select("transaction_type, ticker, quantity")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", ticker);

  if (transactionsError) {
    throw new Error(
      `Unable to calculate holdings: ${transactionsError.message}`
    );
  }

  let sharesOwned = 0;

  transactions?.forEach((transaction) => {
    const transactionQuantity =
      Number(transaction.quantity ?? 0);

    if (transaction.transaction_type === "buy") {
      sharesOwned += transactionQuantity;
    }

    if (transaction.transaction_type === "sell") {
      sharesOwned -= transactionQuantity;
    }
  });

  // ---------------------------------------------------------
  // Share guardrails
  // ---------------------------------------------------------

  if (sharesOwned <= 0) {
    return {
      success: false,
      message: `The portfolio does not currently own any shares of ${ticker}.`,
    };
  }

  if (quantity > sharesOwned) {
    return {
      success: false,
      message:
        `Insufficient shares. You own ${sharesOwned.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 8,
          }
        )} shares of ${ticker}, but attempted to sell ${quantity.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 8,
          }
        )}.`,
    };
  }

  const grossAmount = quantity * pricePerShare;

  if (fees > grossAmount) {
    return {
      success: false,
      message: "Fees cannot exceed the gross sale proceeds.",
    };
  }

  // ---------------------------------------------------------
  // Record sale
  // ---------------------------------------------------------

  const { error } = await supabase.from("transactions").insert({
    user_id: user.id,
    portfolio_id: portfolioId,
    transaction_type: "sell",
    ticker,
    quantity,
    price_per_share: pricePerShare,
    gross_amount: grossAmount,
    fees,
    transaction_date: transactionDateUtc,
    notes: notes || null,
  });

  if (error) {
    throw new Error(`Unable to record sale: ${error.message}`);
  }

  revalidatePath("/");

  return {
    success: true,
    message: `Sale recorded successfully: ${quantity} ${ticker} at $${pricePerShare.toFixed(
      2
    )}.`,
  };
}