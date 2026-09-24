"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CycleStatus = {
  cycleDate: string;
  hasCycleToday: boolean;
  status: string;
  retryAvailable: boolean;
  executionEnabled: boolean;
  transactionsWrittenByCycle: boolean;
  cycle: {
    universe_count: number | null;
    preselected_count: number | null;
    evaluated_count: number | null;
    discovery_advance_count: number | null;
    catalyst_supported_count: number | null;
    deep_research_completed_count: number | null;
    deep_research_failed_count: number | null;
    proceed_count: number | null;
    committee_decision_count: number | null;
    persisted_decision_count: number | null;
    failure_message: string | null;
  } | null;
};

export default function AgDailyCycleControl({ initialStatus }: { initialStatus: CycleStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus() {
    const response = await fetch("/api/accelerated-growth/daily-cycle/status", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setStatus(body);
  }

  async function runCycle() {
    setRunning(true);
    setMessage(null);
    try {
      const retry = status.retryAvailable ? "?retryFailed=true" : "";
      const response = await fetch(`/api/accelerated-growth/daily-cycle${retry}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reason ?? body.error ?? "Accelerated Growth cycle failed.");
      setMessage(body.reusedDailyCycle ? "Today's cycle already exists; no duplicate work was created." : "Today's Accelerated Growth research cycle completed.");
      await refreshStatus();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Accelerated Growth cycle failed.");
      await refreshStatus();
    } finally {
      setRunning(false);
    }
  }

  const completed = status.status === "completed";
  const failed = status.status === "failed";
  const label = running ? "Running Research…" : failed ? "Retry Today's Cycle" : completed ? "Today's Cycle Complete" : "Run Today's AG Research";

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Daily Research Cycle</p>
          <p className="mt-1 text-xs text-gray-500">{status.cycleDate} · {status.status.replaceAll("_", " ").toUpperCase()}</p>
        </div>
        <button
          type="button"
          onClick={runCycle}
          disabled={running || completed}
          className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {label}
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">Research and Committee persistence only. Transaction execution is locked off.</p>

      {status.cycle && (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          <span>Universe: {status.cycle.universe_count ?? 0}</span>
          <span>Advanced: {status.cycle.discovery_advance_count ?? 0}</span>
          <span>Deep Research: {status.cycle.deep_research_completed_count ?? 0}</span>
          <span>Committee: {status.cycle.committee_decision_count ?? 0}</span>
        </div>
      )}

      {status.cycle?.failure_message && <p className="mt-2 text-xs text-red-700">{status.cycle.failure_message}</p>}
      {message && <p className="mt-2 text-xs text-gray-700">{message}</p>}
    </div>
  );
}
