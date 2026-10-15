"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type CycleStatus = {
  cycleDate: string;
  hasCycleToday: boolean;
  previousUnfinishedCycle: { cycle_date: string; updated_at: string } | null;
  previousCycleReconciliation: { stageCheckpoints: number; symbolCheckpoints: number; watchWriteRecords: number; decisionWriteRecords: number; attributedDecisionCount: number; decisionInventoryTruncated: boolean } | null;
  stalled: boolean;
  lastActivityAt: string | null;
  status: string;
  retryAvailable: boolean;
  retryBlockedReason?: string | null;
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
  const [statusError, setStatusError] = useState<string | null>(null);

  async function refreshStatus() {
    const response = await fetch("/api/accelerated-growth/daily-cycle/status", { cache: "no-store" });
    if (!response.ok) { setStatusError("Could not refresh cycle status. Please try again."); return; }
    const body = await response.json();
    setStatus(body);
    setStatusError(null);
  }

  async function runCycle() {
    setRunning(true);
    setMessage(null);
    try {
      const retry = status.retryAvailable ? "?retryFailed=true" : "";
      const response = await fetch(`/api/accelerated-growth/daily-cycle${retry}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reason ?? body.error ?? "Research request ended unexpectedly. Refresh status before taking another action.");
      setMessage(body.reusedDailyCycle ? "Today's cycle already exists; no duplicate work was created." : "Today's Accelerated Growth research cycle completed.");
      await refreshStatus();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research request failed. Check cycle status.");
      await refreshStatus();
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (status.status !== "running") return;
    const interval = window.setInterval(() => { void refreshStatus(); }, 15000);
    return () => window.clearInterval(interval);
  }, [status.status]);

  const completed = status.status === "completed";
  const failed = status.status === "failed";
  const label = status.previousUnfinishedCycle ? "Previous Cycle Needs Review" : running ? "Running Research…" : status.stalled ? "Review Stalled Cycle" : status.status === "running" ? "Research In Progress" : failed ? "Cycle Failed — Review Required" : completed ? "Today's Cycle Complete" : "Run Today's AG Research";

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
          disabled={running || completed || failed || status.status === "running" || Boolean(status.previousUnfinishedCycle)}
          className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {label}
        </button>
      </div>

      <p className="mt-2 text-xs text-gray-500">Research and Committee persistence only. Transaction execution is locked off.</p>
      {status.previousUnfinishedCycle && <p role="alert" className="mt-2 text-xs font-semibold text-amber-800">The {status.previousUnfinishedCycle.cycle_date} research cycle is unfinished. New research is paused until it is reconciled.</p>}
      {status.previousCycleReconciliation && <p className="mt-2 text-xs text-slate-700">Recorded prior-cycle evidence: {status.previousCycleReconciliation.stageCheckpoints} stage checkpoints, {status.previousCycleReconciliation.symbolCheckpoints} symbol checkpoints, {status.previousCycleReconciliation.watchWriteRecords} watch writes, {status.previousCycleReconciliation.decisionWriteRecords} decision writes, {status.previousCycleReconciliation.attributedDecisionCount} attributed decisions. {status.previousCycleReconciliation.decisionInventoryTruncated ? "Decision inventory truncated; manual review required." : "Zero records do not establish that retrying is safe."}</p>}
      {status.status === "running" && <p role="status" className="mt-2 text-xs text-amber-800">{status.stalled ? "No recorded activity for at least seven minutes. This cycle needs review before another attempt." : "Cycle is recorded as running. This does not guarantee the server request is still active."}</p>}
      {status.lastActivityAt && <p className="mt-1 text-xs text-gray-500">Last recorded activity: {new Date(status.lastActivityAt).toLocaleString()}</p>}
      <button type="button" onClick={() => void refreshStatus()} className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800">Refresh Cycle Status</button>
      {statusError && <p role="alert" className="mt-2 text-xs text-red-700">{statusError}</p>}

      {status.cycle && (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
          <span>Universe: {status.cycle.universe_count ?? "Not recorded"}</span>
          <span>Advanced: {status.cycle.discovery_advance_count ?? "Not recorded"}</span>
          <span>Deep Research: {status.cycle.deep_research_completed_count ?? "Not recorded"}</span>
          <span>Committee: {status.cycle.committee_decision_count ?? "Not recorded"}</span>
        </div>
      )}

      {failed && <p className="mt-2 text-xs text-amber-700">{status.retryBlockedReason ?? "Review this failed cycle before running again; prior writes may have succeeded."}</p>}
      {status.cycle?.failure_message && <p className="mt-2 text-xs text-red-700">{status.cycle.failure_message}</p>}
      {message && <p className="mt-2 text-xs text-gray-700">{message}</p>}
    </div>
  );
}
