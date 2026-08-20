"use client";

import { useActionState } from "react";
import { addInvestmentDecision } from "@/app/decision-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type Portfolio = {
  id: string;
  name: string;
};

type DecisionFormProps = {
  portfolios: Portfolio[];
};

export default function DecisionForm({
  portfolios,
}: DecisionFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(addInvestmentDecision, initialActionState);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Record Investment Decision
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Preserve the reasoning behind a portfolio decision before the outcome
          is known.
        </p>
      </div>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form
        action={formAction}
        className="mt-6 grid gap-5 md:grid-cols-2"
      >
        <div>
          <label
            htmlFor="decision_portfolio_id"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Portfolio
          </label>

          <select
            id="decision_portfolio_id"
            name="portfolio_id"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select a portfolio</option>

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
            htmlFor="decision_type"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Decision
          </label>

          <select
            id="decision_type"
            name="decision_type"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select decision</option>
            <option value="buy">BUY</option>
            <option value="sell">SELL</option>
            <option value="hold">HOLD</option>
            <option value="watch">WATCH</option>
            <option value="rebalance">REBALANCE</option>
            <option value="avoid">AVOID</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="decision_ticker"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Ticker
          </label>

          <input
            id="decision_ticker"
            name="ticker"
            type="text"
            required
            placeholder="MSFT"
            className="w-full rounded border border-gray-300 px-3 py-2 uppercase"
          />
        </div>

        <div>
          <label
            htmlFor="decision_date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Decision Date
          </label>

          <input
            id="decision_date"
            name="decision_date"
            type="datetime-local"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="decision_price"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Decision Price
          </label>

          <input
            id="decision_price"
            name="decision_price"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue=""
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="recommended_allocation"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Recommended Allocation
          </label>

          <input
            id="recommended_allocation"
            name="recommended_allocation"
            type="number"
            min="0"
            step="0.01"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="confidence_score"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Confidence Score
          </label>

          <input
            id="confidence_score"
            name="confidence_score"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="82"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="risk_level"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Risk Level
          </label>

          <select
            id="risk_level"
            name="risk_level"
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Not specified</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="expected_holding_period"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Expected Holding Period
          </label>

          <input
            id="expected_holding_period"
            name="expected_holding_period"
            type="text"
            placeholder="3–5 years"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="thesis"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Thesis
          </label>

          <textarea
            id="thesis"
            name="thesis"
            required
            rows={5}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="bull_case"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Bull Case
          </label>

          <textarea
            id="bull_case"
            name="bull_case"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="bear_case"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Bear Case
          </label>

          <textarea
            id="bear_case"
            name="bear_case"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="primary_risks"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Primary Risks
          </label>

          <textarea
            id="primary_risks"
            name="primary_risks"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="reassessment_conditions"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Reassessment Conditions
          </label>

          <textarea
            id="reassessment_conditions"
            name="reassessment_conditions"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="exit_conditions"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Exit Conditions
          </label>

          <textarea
            id="exit_conditions"
            name="exit_conditions"
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {pending
              ? "Recording..."
              : "Record Decision"}
          </button>
        </div>
      </form>
    </div>
  );
}