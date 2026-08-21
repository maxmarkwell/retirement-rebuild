"use client";

import { useActionState } from "react";
import { runDiscoveryAction } from "@/app/discovery-actions";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import FormMessage from "@/components/form-message";

export default function DiscoveryRunForm() {
  const [state, formAction, pending] =
    useActionState<
      ActionState,
      FormData
    >(
      runDiscoveryAction,
      initialActionState
    );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">
        Run Stock Discovery
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Screen the current stock universe using deterministic financial scoring.
      </p>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form
        action={formAction}
        className="mt-6 flex flex-wrap items-end gap-4"
      >
        <div>
          <label
            htmlFor="portfolio_mode"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Portfolio
          </label>

          <select
            id="portfolio_mode"
            name="portfolio_mode"
            defaultValue="paper_long_term"
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="paper_long_term">
              AI Long-Term
            </option>

            <option value="paper_active">
              AI Active
            </option>
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {pending
            ? "Scanning..."
            : "Run Discovery"}
        </button>
      </form>
    </div>
  );
}