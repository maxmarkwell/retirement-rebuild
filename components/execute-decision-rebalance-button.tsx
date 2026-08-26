"use client";

import { useActionState } from "react";
import { executeDecisionRebalance } from "@/app/decision-execution-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type ExecuteDecisionRebalanceButtonProps = {
  decisionId: string;
  ticker: string;
  recommendedAllocation: number | string | null;
  status: string;
  hasTransaction: boolean;
};

export default function ExecuteDecisionRebalanceButton({
  decisionId,
  ticker,
  recommendedAllocation,
  status,
  hasTransaction,
}: ExecuteDecisionRebalanceButtonProps) {
  const [state, formAction, pending] =
    useActionState<
      ActionState,
      FormData
    >(
      executeDecisionRebalance,
      initialActionState
    );

  const allocation =
    recommendedAllocation != null
      ? Number(recommendedAllocation)
      : null;

  const hasValidAllocation =
    allocation != null &&
    Number.isFinite(allocation) &&
    allocation >= 0;

  const canExecute =
    !hasTransaction &&
    status !== "executed" &&
    hasValidAllocation;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Paper Execution
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Rebalance the paper position to the committee&apos;s recommended target allocation.
      </p>

      <div className="mt-4">
        <FormMessage state={state} />
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
              : `Execute Paper Rebalance — ${ticker} to $${allocation.toLocaleString(
                  "en-US",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}`}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          {hasTransaction ||
          status === "executed"
            ? "This decision has already been executed."
            : "This decision does not have a valid target allocation."}
        </p>
      )}
    </div>
  );
}