"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMarketQuote } from "@/lib/market-data/twelve-data";
import { recordBuyTransaction } from "@/lib/portfolio/record-buy";
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

  const now =
    new Date().toISOString();

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
          now,

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