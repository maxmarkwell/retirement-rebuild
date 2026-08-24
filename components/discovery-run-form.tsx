"use client";

import { useActionState } from "react";

import {
  processDiscoveryAction,
  runDiscoveryAction,
} from "@/app/discovery-actions";

import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";

import FormMessage from "@/components/form-message";

const TEST_SCAN_RUN_ID =
  "81744606-3be9-4782-8f2f-bff9ff3c6d5b";

export default function DiscoveryRunForm() {
  const [
    runState,
    runFormAction,
    runPending,
  ] =
    useActionState<
      ActionState,
      FormData
    >(
      runDiscoveryAction,
      initialActionState
    );

  const [
    processState,
    processFormAction,
    processPending,
  ] =
    useActionState<
      ActionState,
      FormData
    >(
      processDiscoveryAction,
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
        <FormMessage
          state={runState}
        />
      </div>

      <form
        action={runFormAction}
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
          disabled={runPending}
          className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {runPending
            ? "Starting..."
            : "Run Discovery"}
        </button>
      </form>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <p className="text-sm font-medium text-gray-900">
          Temporary V2 Worker Test
        </p>

        <p className="mt-1 text-xs text-gray-500">
          Advances the current test scan by one processing stage.
        </p>

        <div className="mt-4">
          <FormMessage
            state={processState}
          />
        </div>

        <form
          action={
            processFormAction
          }
          className="mt-4"
        >
          <input
            type="hidden"
            name="scan_run_id"
            value={
              TEST_SCAN_RUN_ID
            }
          />

          <button
            type="submit"
            disabled={
              processPending
            }
            className="rounded border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-900 disabled:opacity-50"
          >
            {processPending
              ? "Processing..."
              : "Process Scan"}
          </button>
        </form>
      </div>
    </div>
  );
}