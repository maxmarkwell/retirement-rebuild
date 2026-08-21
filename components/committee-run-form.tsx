"use client";

import { useActionState } from "react";
import { createCommitteeRun } from "@/app/committee-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type Portfolio = {
  id: string;
  name: string;
};

type CommitteeRunFormProps = {
  portfolios: Portfolio[];

  defaultTicker?: string;

  defaultPortfolioId?: string;
};

export default function CommitteeRunForm({
  portfolios,
  defaultTicker = "",
  defaultPortfolioId = "",
}: CommitteeRunFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(createCommitteeRun, initialActionState);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">
        Start Committee Run
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Review the candidate, then start a paid AI Investment Committee analysis.
      </p>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form
        action={formAction}
        className="mt-6 grid gap-5 md:grid-cols-2"
      >
        <div>
          <label
            htmlFor="committee_portfolio_id"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Portfolio
          </label>

          <select
            id="committee_portfolio_id"
            name="portfolio_id"
            required
            defaultValue={defaultPortfolioId}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">
              Select a portfolio
            </option>

            {portfolios.map((portfolio) => (
              <option
                key={portfolio.id}
                value={portfolio.id}
              >
                {portfolio.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="committee_ticker"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Ticker
          </label>

          <input
            id="committee_ticker"
            name="ticker"
            type="text"
            required
            defaultValue={defaultTicker}
            placeholder="MSFT"
            className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {pending
              ? "Running Committee..."
              : "Start Committee Run"}
          </button>
        </div>
      </form>
    </div>
  );
}