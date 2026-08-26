"use client";

import { useActionState } from "react";
import { executeDecisionSell } from "@/app/decision-execution-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type ExecuteDecisionSellButtonProps = {
  decisionId: string;
  ticker: string;
  recommendedQuantity: number | string | null;
  status: string;
  hasTransaction: boolean;
};

export default function ExecuteDecisionSellButton({
  decisionId,
  ticker,
  recommendedQuantity,
  status,
  hasTransaction,
}: ExecuteDecisionSellButtonProps) {
  const [state, formAction, pending] =
    useActionState<
      ActionState,
      FormData
    >(
      executeDecisionSell,
      initialActionState
    );

  const quantity =
    recommendedQuantity != null
      ? Number(
          recommendedQuantity
        )
      : null;

  const hasValidQuantity =
    quantity != null &&
    Number.isFinite(quantity) &&
    quantity > 0;

  const canExecute =
    !hasTransaction &&
    status !== "executed";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Paper Execution
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Execute the staged paper sale for this approved SELL decision.
      </p>

      <div className="mt-4">
        <FormMessage
          state={state}
        />
      </div>

      {canExecute ? (
        <form
          action={formAction}
          className="mt-5"
        >
          <input
            type="hidden"
            name="decision_id"
            value={decisionId}
          />

          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending
              ? "Executing..."
              : hasValidQuantity
                ? `Execute Paper Sell — ${quantity.toLocaleString(
                    "en-US",
                    {
                      maximumFractionDigits:
                        4,
                    }
                  )} ${ticker}`
                : `Execute Paper Sell — Exit ${ticker}`}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          This decision has already
          been executed.
        </p>
      )}
    </div>
  );
}