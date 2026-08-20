"use client";

import { useActionState } from "react";
import { addDecisionEvaluation } from "@/app/evaluation-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

type DecisionEvaluationFormProps = {
  decisionId: string;
  ticker: string;
};

export default function DecisionEvaluationForm({
  decisionId,
  ticker,
}: DecisionEvaluationFormProps) {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(addDecisionEvaluation, initialActionState);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Evaluate {ticker}
        </h2>

        <p className="mt-1 text-sm text-gray-600">
          Record what has changed since the original decision without altering
          the original thesis.
        </p>
      </div>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form
        action={formAction}
        className="mt-6 grid gap-5 md:grid-cols-2"
      >
        <input
          type="hidden"
          name="decision_id"
          value={decisionId}
        />

        <div>
          <label
            htmlFor="evaluation_date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Evaluation Date
          </label>

          <input
            id="evaluation_date"
            name="evaluation_date"
            type="datetime-local"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="evaluation_price"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Evaluation Price
          </label>

          <input
            id="evaluation_price"
            name="evaluation_price"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue=""
            placeholder="Current market price"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="thesis_status"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Thesis Status
          </label>

          <select
            id="thesis_status"
            name="thesis_status"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">
              Select thesis status
            </option>

            <option value="intact">
              Intact
            </option>

            <option value="strengthened">
              Strengthened
            </option>

            <option value="weakened">
              Weakened
            </option>

            <option value="invalidated">
              Invalidated
            </option>
          </select>
        </div>

        <div>
          <label
            htmlFor="recommendation_status"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Recommendation
          </label>

          <select
            id="recommendation_status"
            name="recommendation_status"
            required
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            <option value="">
              Select recommendation
            </option>

            <option value="continue">
              Continue
            </option>

            <option value="reassess">
              Reassess
            </option>

            <option value="reduce">
              Reduce
            </option>

            <option value="exit">
              Exit
            </option>

            <option value="closed">
              Closed
            </option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="evaluation_summary"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Evaluation Summary
          </label>

          <textarea
            id="evaluation_summary"
            name="evaluation_summary"
            required
            rows={5}
            placeholder="Summarize what has changed since the original decision."
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="what_was_right"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            What Was Right
          </label>

          <textarea
            id="what_was_right"
            name="what_was_right"
            rows={4}
            placeholder="What parts of the original reasoning have held up?"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="what_was_wrong"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            What Was Wrong
          </label>

          <textarea
            id="what_was_wrong"
            name="what_was_wrong"
            rows={4}
            placeholder="What assumptions or expectations were incorrect?"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="new_information"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            New Information
          </label>

          <textarea
            id="new_information"
            name="new_information"
            rows={4}
            placeholder="New earnings, competitive developments, valuation changes, or other relevant information."
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
              : "Record Evaluation"}
          </button>
        </div>
      </form>
    </div>
  );
}