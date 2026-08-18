"use client";

import { useActionState } from "react";
import { addSellTransaction } from "@/app/actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type Portfolio = {
  id: string;
  name: string;
};

type SellFormProps = {
  portfolios: Portfolio[];
};

export default function SellForm({
  portfolios,
}: SellFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(addSellTransaction, initialActionState);

  return (
    <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">
        Record Test Sell
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Paper/test transaction only. You cannot sell more shares than the
        portfolio owns.
      </p>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form
        action={formAction}
        className="mt-6 grid gap-4 md:grid-cols-2"
      >
        <div>
          <label
            htmlFor="sell_portfolio_id"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Portfolio
          </label>

          <select
            id="sell_portfolio_id"
            name="portfolio_id"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a portfolio</option>

            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>
                {portfolio.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sell_ticker"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Ticker
          </label>

          <input
            id="sell_ticker"
            name="ticker"
            type="text"
            required
            placeholder="TEST"
            className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
          />
        </div>

        <div>
          <label
            htmlFor="sell_quantity"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Quantity
          </label>

          <input
            id="sell_quantity"
            name="quantity"
            type="number"
            min="0.00000001"
            step="0.00000001"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="sell_price_per_share"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Sale Price Per Share
          </label>

          <input
            id="sell_price_per_share"
            name="price_per_share"
            type="number"
            min="0.00000001"
            step="0.00000001"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="sell_fees"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Fees
          </label>

          <input
            id="sell_fees"
            name="fees"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="sell_transaction_date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Transaction Date
          </label>

          <input
            id="sell_transaction_date"
            name="transaction_date"
            type="datetime-local"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="sell_notes"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Notes
          </label>

          <input
            id="sell_notes"
            name="notes"
            type="text"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {pending ? "Recording..." : "Record Test Sell"}
          </button>
        </div>
      </form>
    </div>
  );
}