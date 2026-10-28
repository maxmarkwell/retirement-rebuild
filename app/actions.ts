"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fromZonedTime } from "date-fns-tz";
import type { ActionState } from "@/lib/forms/action-state";

// ---------------------------------------------------------
// CONTRIBUTION
// ---------------------------------------------------------

/**
 * Legacy Server Action is permanently non-posting. The only contemplated
 * real contribution write path is the independently gated, idempotent API.
 * Keep this stub while any compiled clients might still invoke this action.
 */
export async function addContribution(
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  return {
    success: false,
    message: "Legacy contribution entry is disabled. Use the read-only shared-capital preview until verified posting is enabled.",
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
  .select("id, starting_capital, is_real_money, type")
  .eq("id", portfolioId)
  .single();

  if (portfolioError || !portfolio) {
    throw new Error("Unable to load the selected portfolio.");
  }

  if (portfolio.is_real_money) {
  return {
    success: false,
    message:
      "Real-money purchases must be recorded from the linked investment decision after the brokerage order fills.",
  };
}

  if (portfolio.type === "paper_active") {
    return {
      success: false,
      message:
        "Accelerated Growth purchases must use the decision-linked deterministic AG execution path.",
    };
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
  // Protect managed execution paths
  // ---------------------------------------------------------

  const { data: sellPortfolio, error: sellPortfolioError } = await supabase
    .from("portfolios")
    .select("id, is_real_money, type")
    .eq("id", portfolioId)
    .single();

  if (sellPortfolioError || !sellPortfolio) {
    throw new Error("Unable to load the selected portfolio.");
  }

  if (sellPortfolio.is_real_money) {
    return {
      success: false,
      message:
        "Real-money sales must use the decision-linked Real Portfolio execution path.",
    };
  }

  if (sellPortfolio.type === "paper_active") {
    return {
      success: false,
      message:
        "Accelerated Growth sales must use the decision-linked AG execution path.",
    };
  }

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
/**
 * Manual dividend receipt only. No brokerage operation is initiated.
 * The portfolio and matching holding are verified server-side.
 */
export async function addDividend(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, message: "You must be signed in." };

  const portfolioId = String(formData.get("portfolio_id") ?? "");
  const ticker = String(formData.get("ticker") ?? "").trim().toUpperCase();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const date = String(formData.get("payment_date") ?? "");
  const cents = Number(rawAmount) * 100;
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(ticker) ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(rawAmount) ||
      !Number.isSafeInteger(cents) || cents < 1 || cents > 100000000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date + "T12:00:00Z")) ||
      new Date(date + "T12:00:00Z").toISOString().slice(0,10) !== date) {
    return { success: false, message: "Enter a valid stock symbol, whole-cent dividend, and payment date." };
  }
  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id,type,is_real_money").eq("id",portfolioId).eq("user_id",user.id).maybeSingle();
  if (portfolioError || !portfolio ||
      !(portfolio.type === "real" && portfolio.is_real_money ||
        portfolio.type === "paper_active" && !portfolio.is_real_money)) {
    return { success: false, message: "Select Permanent Capital or Accelerated Growth." };
  }

  const { data: prior, error: priorError } = await supabase.from("transactions")
    .select("id,transaction_type,quantity,ticker")
    .eq("user_id",user.id).eq("portfolio_id",portfolioId)
    .eq("ticker",ticker).in("transaction_type",["buy","sell"]);
  if (priorError) return { success:false, message:"Unable to verify owned shares." };
  const held = (prior ?? []).reduce((n,t) => n + (t.transaction_type === "buy" ? 1 : -1) * Number(t.quantity ?? 0), 0);
  if (!(held > 0)) return {success:false,message:"No shares of that symbol are recorded in this portfolio."};

  // One distribution per portfolio/symbol/payment-date/amount. Reject repeated
  // manual attempts; do not silently assume a repeated notification is new cash.
  const { data: existing, error: duplicateError } = await supabase.from("transactions")
    .select("id,gross_amount")
    .eq("user_id",user.id).eq("portfolio_id",portfolioId).eq("ticker",ticker)
    .eq("transaction_type","dividend")
    .gte("transaction_date", date+"T00:00:00Z")
    .lt("transaction_date",new Date(Date.parse(date+"T00:00:00Z")+86400000).toISOString());
  if (duplicateError) return {success:false,message:"Could not verify prior dividend entries."};
  if ((existing ?? []).some(t => Math.round(Number(t.gross_amount)*100) === cents)) {
    return {success:false,message:"This dividend is already recorded. Review transaction history before recording again."};
  }

  const { error } = await supabase.from("transactions").insert({
    user_id:user.id,portfolio_id:portfolioId,transaction_type:"dividend",
    ticker,quantity:null,price_per_share:null,gross_amount:cents/100,
    fees:0,transaction_date:date+"T12:00:00Z",
    notes:"Manual dividend received",
  });
  if (error) return {success:false,message:"Unable to record dividend. Check transaction history before retrying."};
  revalidatePath("/");
  return {success:true,message:`Dividend recorded: ${ticker} +$${(cents/100).toFixed(2)}. No brokerage transaction was initiated.`};
}
