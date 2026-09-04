"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordBuyTransaction } from "@/lib/portfolio/record-buy";
import type { ActionState } from "@/lib/forms/action-state";

export async function recordRealMoneyBuy(
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

  const decisionId = String(
    formData.get("decision_id") ?? ""
  );

  const quantity = Number(
    formData.get("quantity")
  );

  const pricePerShare = Number(
    formData.get("price_per_share")
  );

  const fees = Number(
    formData.get("fees") ?? 0
  );

  const transactionDateRaw = String(
    formData.get("transaction_date") ?? ""
  );

  if (!decisionId) {
    return {
      success: false,
      message: "Decision ID is required.",
    };
  }

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0
  ) {
    return {
      success: false,
      message:
        "Actual shares purchased must be greater than zero.",
    };
  }

  if (
    !Number.isFinite(pricePerShare) ||
    pricePerShare <= 0
  ) {
    return {
      success: false,
      message:
        "Actual price per share must be greater than zero.",
    };
  }

  if (
    !Number.isFinite(fees) ||
    fees < 0
  ) {
    return {
      success: false,
      message:
        "Fees cannot be negative.",
    };
  }

  if (!transactionDateRaw) {
    return {
      success: false,
      message:
        "Execution date and time are required.",
    };
  }

  const transactionDate =
    new Date(transactionDateRaw);

  if (
    Number.isNaN(
      transactionDate.getTime()
    )
  ) {
    return {
      success: false,
      message:
        "Execution date and time are invalid.",
    };
  }

  // ---------------------------------------------------------
  // Load decision
  // ---------------------------------------------------------

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
    decision.transaction_id ||
    decision.status === "executed"
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
        "Only BUY decisions can be recorded with this action.",
    };
  }

  // ---------------------------------------------------------
  // Confirm this is a real-money portfolio
  // ---------------------------------------------------------

  const {
    data: portfolio,
    error: portfolioError,
  } = await supabase
    .from("portfolios")
    .select(
      "id, name, is_real_money"
    )
    .eq(
      "id",
      decision.portfolio_id
    )
    .single();

  if (
    portfolioError ||
    !portfolio
  ) {
    return {
      success: false,
      message:
        "Unable to load the selected portfolio.",
    };
  }

  if (!portfolio.is_real_money) {
    return {
      success: false,
      message:
        "This action can only be used for a real-money portfolio.",
    };
  }

  // ---------------------------------------------------------
  // Record actual brokerage fill
  // ---------------------------------------------------------

  try {
    const transaction =
      await recordBuyTransaction({
        portfolioId:
          decision.portfolio_id,

        ticker:
          decision.ticker,

        quantity,

        pricePerShare,

        fees,

        transactionDate:
          transactionDate.toISOString(),

        notes:
          `Actual brokerage BUY recorded for real-money investment decision ${decision.id}.`,
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
        `Transaction was recorded, but the decision could not be linked: ${updateDecisionError.message}`
      );
    }

    revalidatePath("/");
    revalidatePath("/decisions");
    revalidatePath(
      `/decisions/${decision.id}`
    );
    revalidatePath("/performance");
    revalidatePath("/activity");

    return {
      success: true,
      message:
        `Actual brokerage purchase recorded: ${quantity.toLocaleString(
          "en-US",
          {
            maximumFractionDigits: 6,
          }
        )} ${decision.ticker} at $${pricePerShare.toFixed(
          2
        )}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to record actual brokerage purchase.";

    return {
      success: false,
      message:
        `Recording failed: ${message}`,
    };
  }
}