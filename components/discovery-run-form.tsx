"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  runDiscoveryAction,
} from "@/app/discovery-actions";

import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";

import FormMessage from "@/components/form-message";

type ProcessScanResult = {
  scanRunId: string;

  status:
    | "pending"
    | "running"
    | "completed"
    | "failed";

  stage: string;

  completedStage?: string;
  nextStage?: string;
  message?: string;
};

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
    workerMessage,
    setWorkerMessage,
  ] = useState("");

  const [
    processing,
    setProcessing,
  ] = useState(false);

  const processingRunId =
    useRef<string | null>(
      null
    );

  useEffect(() => {
    const scanRunId =
      runState.scanRunId;

    if (
      !runState.success ||
      !scanRunId
    ) {
      return;
    }

    if (
      processingRunId.current ===
      scanRunId
    ) {
      return;
    }

    processingRunId.current =
      scanRunId;

    let cancelled = false;

    async function processScan() {
      setProcessing(true);

      setWorkerMessage(
        "Discovery is processing..."
      );

      try {
        let finished = false;

        while (
          !finished &&
          !cancelled
        ) {
          const response =
            await fetch(
              "/api/discovery-v2/process",
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    scanRunId,
                  }),
              }
            );

          const data =
            (await response.json()) as
              | ProcessScanResult
              | {
                  error?: string;
                };

          if (!response.ok) {
            throw new Error(
              "error" in data
                ? data.error ??
                    "Unable to process Discovery."
                : "Unable to process Discovery."
            );
          }

          const result =
            data as ProcessScanResult;

          if (
            result.status ===
            "failed"
          ) {
            throw new Error(
              result.message ??
                `Discovery failed during ${result.stage}.`
            );
          }

          if (
            result.status ===
            "completed"
          ) {
            setWorkerMessage(
              result.message ??
                "Discovery V2 completed."
            );

            finished = true;

            window.location.reload();

            break;
          }

          setWorkerMessage(
            result.message ??
              (
                result.nextStage
                  ? `Discovery advanced to ${result.nextStage}.`
                  : `Discovery stage: ${result.stage}.`
              )
          );

          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                500
              )
          );
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to process Discovery V2.";

          setWorkerMessage(
            `Discovery processing paused: ${message} You can click Run Discovery to resume this scan.`
          );
        }
      } finally {
        if (!cancelled) {
          setProcessing(
            false
          );
        }
      }
    }

    processScan();

    return () => {
      cancelled = true;
    };
  }, [
    runState.success,
    runState.scanRunId,
  ]);

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

      {workerMessage && (
        <div className="mt-4 rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {workerMessage}
        </div>
      )}

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
            disabled={
              runPending ||
              processing
            }
            className="rounded border border-gray-300 px-3 py-2 disabled:opacity-50"
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
          disabled={
            runPending ||
            processing
          }
          className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {runPending
            ? "Starting..."
            : processing
              ? "Processing..."
              : "Run Discovery"}
        </button>
      </form>
    </div>
  );
}