"use client";

import { useActionState } from "react";
import { addContribution } from "@/app/actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type Portfolio = {
  id: string;
  name: string;
};

type ContributionFormProps = {
  portfolios: Portfolio[];
};

export default function ContributionForm({
  portfolios,
}: ContributionFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(addContribution, initialActionState);

  return (
    <div className="mt-10 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">
        Record Contribution
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Test contributions only for now. No real brokerage funding yet.
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
            htmlFor="contribution_portfolio_id"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Portfolio
          </label>

          <select
            id="contribution_portfolio_id"
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
            htmlFor="amount"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Amount
          </label>

          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="200.00"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="contribution_date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Contribution Date
          </label>

          <input
            id="contribution_date"
            name="contribution_date"
            type="date"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="contribution_notes"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Notes
          </label>

          <input
            id="contribution_notes"
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
            {pending ? "Recording..." : "Record Contribution"}
          </button>
        </div>
      </form>
    </div>
  );
}