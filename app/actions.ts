"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";

export async function addContribution(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const portfolioId = formData.get("portfolio_id") as string;
  const amount = Number(formData.get("amount"));
  const contributionDate = formData.get("contribution_date") as string;
  const notes = formData.get("notes") as string;

  if (!portfolioId) {
    throw new Error("Portfolio is required.");
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Contribution amount must be greater than zero.");
  }

  if (!contributionDate) {
    throw new Error("Contribution date is required.");
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
}

export async function addBuyTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const portfolioId = formData.get("portfolio_id") as string;
  const ticker = (formData.get("ticker") as string)
    ?.trim()
    .toUpperCase();

  const quantity = Number(formData.get("quantity"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const fees = Number(formData.get("fees") || 0);
  const transactionDate = formData.get("transaction_date") as string;
const transactionDateUtc = fromZonedTime(
  transactionDate,
  "America/Denver"
).toISOString();
  const notes = formData.get("notes") as string;

  if (!portfolioId || !ticker || !transactionDate) {
    throw new Error("Portfolio, ticker, and transaction date are required.");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    throw new Error("Price per share must be greater than zero.");
  }

  if (!Number.isFinite(fees) || fees < 0) {
    throw new Error("Fees cannot be negative.");
  }

  const grossAmount = quantity * pricePerShare;
  const totalPurchaseCost = grossAmount + fees;

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, starting_capital")
    .eq("id", portfolioId)
    .single();

  if (portfolioError || !portfolio) {
    throw new Error("Unable to load the selected portfolio.");
  }

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

  if (totalPurchaseCost > availableCash) {
    throw new Error(
      `Insufficient cash. Available cash is $${availableCash.toFixed(
        2
      )}, but this purchase would cost $${totalPurchaseCost.toFixed(2)}.`
    );
  }

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
}

export async function addSellTransaction(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const portfolioId = formData.get("portfolio_id") as string;
  const ticker = (formData.get("ticker") as string)
    ?.trim()
    .toUpperCase();

  const quantity = Number(formData.get("quantity"));
  const pricePerShare = Number(formData.get("price_per_share"));
  const fees = Number(formData.get("fees") || 0);
  const transactionDate = formData.get("transaction_date") as string;
const transactionDateUtc = fromZonedTime(
  transactionDate,
  "America/Denver"
).toISOString();
  const notes = formData.get("notes") as string;

  if (!portfolioId || !ticker || !transactionDate) {
    throw new Error("Portfolio, ticker, and transaction date are required.");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    throw new Error("Price per share must be greater than zero.");
  }

  if (!Number.isFinite(fees) || fees < 0) {
    throw new Error("Fees cannot be negative.");
  }

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
    const transactionQuantity = Number(transaction.quantity ?? 0);

    if (transaction.transaction_type === "buy") {
      sharesOwned += transactionQuantity;
    }

    if (transaction.transaction_type === "sell") {
      sharesOwned -= transactionQuantity;
    }
  });

  if (quantity > sharesOwned) {
    throw new Error(
      `Insufficient shares. You own ${sharesOwned} shares of ${ticker}, but attempted to sell ${quantity}.`
    );
  }

  const grossAmount = quantity * pricePerShare;

  if (fees > grossAmount) {
    throw new Error("Fees cannot exceed the gross sale proceeds.");
  }

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
}