"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMarketQuote } from "@/lib/market-data/twelve-data";
import { recordBuyTransaction } from "@/lib/portfolio/record-buy";
import { recordSellTransaction } from "@/lib/portfolio/record-sell";
import type { ActionState } from "@/lib/forms/action-state";

export async function executeDecisionBuy(
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

  const decisionId =
    formData.get("decision_id") as string;

  if (!decisionId) {
    return {
      success: false,
      message: "Decision ID is required.",
    };
  }

  const {
    data: decision,
    error: decisionError,
  } = await supabase
    .from("investment_decisions")
    .select(
      `
      id,
      portfolio_id,
      transaction_id,
      decision_type,
      ticker,
      recommended_quantity,
      status
      `
    )
    .eq("id", decisionId)
    .single();

  if (
    decisionError ||
    !decision
  ) {
    return {
      success: false,
      message:
        "Unable to load the investment decision.",
    };
  }

  if (decision.transaction_id) {
    return {
      success: false,
      message:
        "This decision has already been executed.",
    };
  }

  if (
    decision.decision_type !== "buy"
  ) {
    return {
      success: false,
      message:
        "Only BUY decisions can be executed with this action.",
    };
  }

  const quantity =
    Number(
      decision.recommended_quantity
    );

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return {
      success: false,
      message:
        "This decision does not have a valid recommended quantity.",
    };
  }

  let executionPrice: number;

  try {
    const quote =
      await getMarketQuote(
        decision.ticker
      );

    executionPrice =
      quote.price;
  } catch (error) {
    console.error(
      `Unable to retrieve execution price for ${decision.ticker}:`,
      error
    );

    return {
      success: false,
      message:
        `Unable to retrieve a current price for ${decision.ticker}.`,
    };
  }

  try {
    const transaction =
      await recordBuyTransaction({
        portfolioId:
          decision.portfolio_id,

        ticker:
          decision.ticker,

        quantity,

        pricePerShare:
          executionPrice,

        fees:
          0,

        transactionDate:
          new Date().toISOString(),

        notes:
          `Paper execution for investment decision ${decision.id}.`,
      });

    const {
      error: updateDecisionError,
    } = await supabase
      .from("investment_decisions")
      .update({
        transaction_id:
          transaction.transactionId,

        status:
          "executed",
      })
      .eq(
        "id",
        decision.id
      );

    if (updateDecisionError) {
      throw new Error(
        `Transaction was created, but the decision could not be linked: ${updateDecisionError.message}`
      );
    }

    revalidatePath("/");
    revalidatePath("/decisions");
    revalidatePath(
      `/decisions/${decision.id}`
    );
    revalidatePath("/discovery");
    revalidatePath("/research");

    return {
      success: true,
      message:
        `Paper buy executed: ${quantity.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 4,
          }
        )} ${decision.ticker} at $${executionPrice.toFixed(
          2
        )}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to execute paper buy.";

    return {
      success: false,
      message:
        `Execution failed: ${message}`,
    };
  }
}

export async function executeDecisionSell(
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

  const decisionId =
    formData.get("decision_id") as string;

  if (!decisionId) {
    return {
      success: false,
      message: "Decision ID is required.",
    };
  }

  const {
    data: decision,
    error: decisionError,
  } = await supabase
    .from("investment_decisions")
    .select(
      `
      id,
      portfolio_id,
      transaction_id,
      decision_type,
      ticker,
      recommended_quantity,
      status
      `
    )
    .eq(
      "id",
      decisionId
    )
    .single();

  if (
    decisionError ||
    !decision
  ) {
    return {
      success: false,
      message:
        "Unable to load the investment decision.",
    };
  }

  if (
    decision.transaction_id
  ) {
    return {
      success: false,
      message:
        "This decision has already been executed.",
    };
  }

  if (
    decision.decision_type !==
    "sell"
  ) {
    return {
      success: false,
      message:
        "Only SELL decisions can be executed with this action.",
    };
  }


  // ---------------------------------------------------------
  // Calculate current shares owned
  // ---------------------------------------------------------

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "transaction_type, ticker, quantity"
    )
    .eq(
      "portfolio_id",
      decision.portfolio_id
    );

  if (
    transactionsError
  ) {
    return {
      success: false,
      message:
        `Unable to calculate current holdings: ${transactionsError.message}`,
    };
  }

  let sharesOwned = 0;

  const normalizedTicker =
    decision.ticker
      .trim()
      .toUpperCase();

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
      normalizedTicker
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

  if (
    sharesOwned <= 0
  ) {
    return {
      success: false,
      message:
        `There is no ${decision.ticker} position available to sell.`,
    };
  }

  /*
    A SELL decision means exit the current
    position unless a valid explicit quantity
    was stored on the decision.
  */

  const recommendedQuantity =
    Number(
      decision.recommended_quantity
    );

  const quantity =
    Number.isFinite(
      recommendedQuantity
    ) &&
    recommendedQuantity > 0
      ? Math.min(
          recommendedQuantity,
          sharesOwned
        )
      : sharesOwned;

  // ---------------------------------------------------------
  // Load execution price
  // ---------------------------------------------------------

  let executionPrice: number;

  try {
    const quote =
      await getMarketQuote(
        decision.ticker
      );

    executionPrice =
      quote.price;
  } catch (error) {
    console.error(
      `Unable to retrieve execution price for ${decision.ticker}:`,
      error
    );

    return {
      success: false,
      message:
        `Unable to retrieve a current price for ${decision.ticker}.`,
    };
  }

  try {
    const transaction =
      await recordSellTransaction({
        portfolioId:
          decision.portfolio_id,

        ticker:
          decision.ticker,

        quantity,

        pricePerShare:
          executionPrice,

        fees:
          0,

        transactionDate:
          new Date().toISOString(),

        notes:
          `Paper execution for investment decision ${decision.id}.`,
      });

    const {
      error: updateDecisionError,
    } = await supabase
      .from("investment_decisions")
      .update({
        transaction_id:
          transaction.transactionId,

        status:
          "executed",
      })
      .eq(
        "id",
        decision.id
      );

    if (
      updateDecisionError
    ) {
      throw new Error(
        `Transaction was created, but the decision could not be linked: ${updateDecisionError.message}`
      );
    }

    revalidatePath("/");
    revalidatePath("/decisions");
    revalidatePath(
      `/decisions/${decision.id}`
    );
    revalidatePath("/discovery");
    revalidatePath("/research");

    return {
      success: true,
      message:
        `Paper sell executed: ${quantity.toLocaleString(
          "en-US",
          {
            maximumFractionDigits:
              4,
          }
        )} ${decision.ticker} at $${executionPrice.toFixed(
          2
        )}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to execute paper sell.";

    return {
      success: false,
      message:
        `Execution failed: ${message}`,
    };
  }
}
export async function executeDecisionRebalance(
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

  const decisionId =
    formData.get("decision_id") as string;

  if (!decisionId) {
    return {
      success: false,
      message: "Decision ID is required.",
    };
  }

  const {
    data: decision,
    error: decisionError,
  } = await supabase
    .from("investment_decisions")
    .select(
      `
      id,
      portfolio_id,
      transaction_id,
      decision_type,
      ticker,
      recommended_allocation,
      status
      `
    )
    .eq(
      "id",
      decisionId
    )
    .single();

  if (
    decisionError ||
    !decision
  ) {
    return {
      success: false,
      message:
        "Unable to load the investment decision.",
    };
  }

  if (
    decision.transaction_id
  ) {
    return {
      success: false,
      message:
        "This decision has already been executed.",
    };
  }

  if (
    decision.decision_type !==
    "rebalance"
  ) {
    return {
      success: false,
      message:
        "Only REBALANCE decisions can be executed with this action.",
    };
  }

  const targetAllocation =
    Number(
      decision.recommended_allocation
    );

  if (
    !Number.isFinite(
      targetAllocation
    ) ||
    targetAllocation < 0
  ) {
    return {
      success: false,
      message:
        "This decision does not have a valid target allocation.",
    };
  }

  let executionPrice: number;

  try {
    const quote =
      await getMarketQuote(
        decision.ticker
      );

    executionPrice =
      quote.price;
  } catch (error) {
    console.error(
      `Unable to retrieve execution price for ${decision.ticker}:`,
      error
    );

    return {
      success: false,
      message:
        `Unable to retrieve a current price for ${decision.ticker}.`,
    };
  }

  const {
    data: transactions,
    error: transactionsError,
  } = await supabase
    .from("transactions")
    .select(
      "transaction_type, ticker, quantity"
    )
    .eq(
      "portfolio_id",
      decision.portfolio_id
    );

  if (
    transactionsError
  ) {
    return {
      success: false,
      message:
        `Unable to calculate current holdings: ${transactionsError.message}`,
    };
  }

  let sharesOwned = 0;

  const normalizedTicker =
    decision.ticker
      .trim()
      .toUpperCase();

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
      normalizedTicker
    ) {
      continue;
    }

    const quantity =
      Number(
        transaction.quantity ??
          0
      );

    if (
      transaction.transaction_type ===
      "buy"
    ) {
      sharesOwned +=
        quantity;
    }

    if (
      transaction.transaction_type ===
      "sell"
    ) {
      sharesOwned -=
        quantity;
    }
  }


  const targetShares =
    targetAllocation /
    executionPrice;

  const deltaShares =
    targetShares -
    sharesOwned;

  const toleranceShares =
    0.0001;

  if (
    Math.abs(
      deltaShares
    ) <
    toleranceShares
  ) {
    const {
      error: updateDecisionError,
    } = await supabase
      .from("investment_decisions")
      .update({
        status:
          "executed",
      })
      .eq(
        "id",
        decision.id
      );

    if (
      updateDecisionError
    ) {
      return {
        success: false,
        message:
          `Rebalance required no trade, but the decision could not be closed: ${updateDecisionError.message}`,
      };
    }

    revalidatePath("/");
    revalidatePath("/decisions");
    revalidatePath(
      `/decisions/${decision.id}`
    );

    return {
      success: true,
      message:
        `No paper trade required. ${decision.ticker} is already at the recommended allocation.`,
    };
  }

  try {
    let transactionId:
      string;

    if (
      deltaShares >
      0
    ) {
      const transaction =
        await recordBuyTransaction({
          portfolioId:
            decision.portfolio_id,

          ticker:
            decision.ticker,

          quantity:
            deltaShares,

          pricePerShare:
            executionPrice,

          fees:
            0,

          transactionDate:
            new Date()
              .toISOString(),

          notes:
            `Paper rebalance BUY for investment decision ${decision.id}.`,
        });

      transactionId =
        transaction.transactionId;
    } else {
      const quantityToSell =
        Math.abs(
          deltaShares
        );

      const transaction =
        await recordSellTransaction({
          portfolioId:
            decision.portfolio_id,

          ticker:
            decision.ticker,

          quantity:
            quantityToSell,

          pricePerShare:
            executionPrice,

          fees:
            0,

          transactionDate:
            new Date()
              .toISOString(),

          notes:
            `Paper rebalance SELL for investment decision ${decision.id}.`,
        });

      transactionId =
        transaction.transactionId;
    }

    const {
      error: updateDecisionError,
    } = await supabase
      .from("investment_decisions")
      .update({
        transaction_id:
          transactionId,

        status:
          "executed",
      })
      .eq(
        "id",
        decision.id
      );

    if (
      updateDecisionError
    ) {
      throw new Error(
        `Transaction was created, but the decision could not be linked: ${updateDecisionError.message}`
      );
    }

    revalidatePath("/");
    revalidatePath("/decisions");
    revalidatePath(
      `/decisions/${decision.id}`
    );
    revalidatePath("/discovery");
    revalidatePath("/research");

    return {
      success: true,
      message:
        deltaShares > 0
          ? `Paper rebalance executed: bought ${deltaShares.toLocaleString(
              "en-US",
              {
                maximumFractionDigits:
                  4,
              }
            )} ${decision.ticker} at $${executionPrice.toFixed(
              2
            )}.`
          : `Paper rebalance executed: sold ${Math.abs(
              deltaShares
            ).toLocaleString(
              "en-US",
              {
                maximumFractionDigits:
                  4,
              }
            )} ${decision.ticker} at $${executionPrice.toFixed(
              2
            )}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to execute paper rebalance.";

    return {
      success: false,
      message:
        `Execution failed: ${message}`,
    };
  }
}
