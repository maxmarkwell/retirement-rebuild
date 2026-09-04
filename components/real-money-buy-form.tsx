"use client";

import { useActionState } from "react";
import { recordRealMoneyBuy } from "@/app/real-money-execution-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type RealMoneyBuyFormProps = {
  decisionId: string;
  ticker: string;
  recommendedQuantity:
    | number
    | string
    | null;
  status: string;
  hasTransaction: boolean;
};

export default function RealMoneyBuyForm({
  decisionId,
  ticker,
  recommendedQuantity,
  status,
  hasTransaction,
}: RealMoneyBuyFormProps) {
  const [state, formAction, pending] =
    useActionState<
      ActionState,
      FormData
    >(
      recordRealMoneyBuy,
      initialActionState
    );

  const quantity =
    recommendedQuantity != null
      ? Number(
          recommendedQuantity
        )
      : null;

  const alreadyExecuted =
    hasTransaction ||
    status === "executed";

  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
          Real Money
        </span>

        <h2 className="text-lg font-semibold text-gray-900">
          Record Brokerage Fill
        </h2>
      </div>

      <p className="mt-3 text-sm leading-6 text-gray-700">
        Place the BUY order with your brokerage first.
        After the order fills, enter the actual execution
        details below. Retirement Rebuild does not place
        the brokerage order.
      </p>

      {quantity != null &&
        Number.isFinite(quantity) &&
        quantity > 0 && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Committee Recommendation
            </p>

            <p className="mt-1 text-sm font-semibold text-gray-900">
              {quantity.toLocaleString(
                "en-US",
                {
                  maximumFractionDigits:
                    6,
                }
              )}{" "}
              shares of {ticker}
            </p>
          </div>
        )}

      <div className="mt-4">
        <FormMessage
          state={state}
        />
      </div>

      {alreadyExecuted ? (
        <p className="mt-5 text-sm font-medium text-gray-600">
          This decision has already been executed.
        </p>
      ) : (
        <form
          action={formAction}
          className="mt-5 space-y-5"
        >
          <input
            type="hidden"
            name="decision_id"
            value={decisionId}
          />

          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-medium text-gray-700"
            >
              Actual shares purchased
            </label>

            <input
              id="quantity"
              name="quantity"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              defaultValue={
                quantity != null &&
                Number.isFinite(
                  quantity
                )
                  ? quantity
                  : undefined
              }
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="price_per_share"
              className="block text-sm font-medium text-gray-700"
            >
              Actual fill price per share
            </label>

            <input
              id="price_per_share"
              name="price_per_share"
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              required
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="fees"
              className="block text-sm font-medium text-gray-700"
            >
              Fees
            </label>

            <input
              id="fees"
              name="fees"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              defaultValue="0"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="transaction_date"
              className="block text-sm font-medium text-gray-700"
            >
              Brokerage execution date and time
            </label>

            <input
              id="transaction_date"
              name="transaction_date"
              type="datetime-local"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
            />
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">
              Confirm before recording
            </p>

            <p className="mt-1 text-sm leading-6 text-red-800">
              Only submit this form after the brokerage
              order has actually filled. The values above
              should match the brokerage confirmation.
            </p>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending
              ? "Recording..."
              : `Record Actual ${ticker} Purchase`}
          </button>
        </form>
      )}
    </div>
  );
}