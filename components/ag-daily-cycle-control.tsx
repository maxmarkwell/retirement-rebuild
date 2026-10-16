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
  reconciliation: {
    attributedDecisionCount: number;
    attributionCountGap: number | null;
    attributedDecisions: Array<{ id: string; ticker: string; decisionType: string; status: string; createdAt: string }>;
    reusedDecisionAttributionAvailable: boolean;
  };
  cycle: {
    attempt_number: number;
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
  const [maxCandidates, setMaxCandidates] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function refreshStatus(): Promise<CycleStatus | null> {
    const response = await fetch("/api/accelerated-growth/daily-cycle/status", { cache: "no-store" });
    if (!response.ok) { setStatusError("Could not refresh cycle status. Please try again."); return null; }
    const body = await response.json();
    setStatus(body);
    setStatusError(null);
    return body as CycleStatus;
  }

  async function runCycle() {
    setRunning(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ max: String(maxCandidates) });
      if (status.retryAvailable) params.set("retryFailed", "true");
      if (status.status === "completed") params.set("newTestRun", "true");
      const response = await fetch(`/api/accelerated-growth/daily-cycle?${params.toString()}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.reason ?? body.error ?? "Research request ended unexpectedly. Refresh status before taking another action.");
      setMessage(body.reusedDailyCycle ? "Today's cycle already exists; no duplicate work was created." : "Today's Accelerated Growth research cycle completed.");
      await refreshStatus();
      router.refresh();
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "Research request failed.";
      try {
        const latest = await refreshStatus();
        if (latest?.status === "completed") {
          setMessage("Research completed successfully. The browser lost the original response, but the saved cycle status confirms completion.");
          router.refresh();
        } else if (latest?.status === "running") {
          setMessage("The browser lost the response, but research is still recorded as running. Use Refresh Cycle Status; do not start another run.");
        } else if (latest?.status === "failed") {
          setMessage(`Research failed: ${latest.cycle?.failure_message ?? failureMessage}`);
        } else {
          setMessage(`Could not confirm research completion: ${failureMessage}. Refresh cycle status before taking another action.`);
        }
      } catch {
        setMessage(`Connection interrupted: ${failureMessage}. Refresh cycle status before taking another action.`);
      }
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Daily Research Cycle</p>
          <p className="mt-1 text-xs text-gray-500">{status.cycleDate} · Attempt {status.cycle?.attempt_number ?? 1} · {status.status.replaceAll("_", " ").toUpperCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ag-max-candidates" className="text-xs font-medium text-gray-700">Candidates</label>
          <select id="ag-max-candidates" value={maxCandidates} onChange={(event) => setMaxCandidates(Number(event.target.value))} disabled={running || failed || status.status === "running" || Boolean(status.previousUnfinishedCycle)} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-gray-900" aria-label="Maximum discovery candidates">
            {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        <button
          type="button"
          onClick={runCycle}
          disabled={running || completed || failed || status.status === "running" || Boolean(status.previousUnfinishedCycle)}
          className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {label}
        </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500">Paper research test mode: completed cycles may be followed by a new numbered attempt today. No trades are executed. Start with 2 candidates for the next test.</p>
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

      {completed && status.cycle && (
        <section aria-label="Latest research cycle results" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Latest Research Cycle Results</h3>
          <p className="mt-1 text-xs text-slate-600">Committee outcomes counted: {status.cycle.committee_decision_count ?? "Unknown"}. Decisions accepted or reused: {status.cycle.persisted_decision_count ?? "Unknown"}.</p>
          <p className="mt-1 text-xs text-slate-600">New decisions linked to this cycle: {status.reconciliation.attributedDecisionCount}.</p>
          {status.reconciliation.attributedDecisions.length > 0 && (
            <div className="mt-2 space-y-2">
              {status.reconciliation.attributedDecisions.map((decision) => (
                <div key={decision.id} className="rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-800">
                  <span className="font-semibold text-slate-900">{decision.ticker}</span> · {decision.decisionType === "avoid" ? "REJECT" : decision.decisionType.toUpperCase()} · {decision.status}
                  <span className="block text-slate-500">Recorded {new Date(decision.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
          {(status.reconciliation.attributionCountGap ?? 0) > 0 && (
            <p className="mt-2 text-xs text-amber-800">{status.reconciliation.attributionCountGap} counted decision(s) have no new cycle-linked record. They may be reused decisions, but the original ticker and outcome cannot be confirmed from the stored cycle summary.</p>
          )}
          {status.reconciliation.attributedDecisions.length === 0 && <p className="mt-2 text-xs text-slate-600">No newly attributed decision records to display. The Committee tab lists active recommendations, which may predate this cycle.</p>}
        </section>
      )}

      {failed && <p className="mt-2 text-xs text-amber-700">{status.retryBlockedReason ?? "Review this failed cycle before running again; prior writes may have succeeded."}</p>}
      {status.cycle?.failure_message && <p className="mt-2 text-xs text-red-700">{status.cycle.failure_message}</p>}
      {message && <p className="mt-2 text-xs text-gray-700">{message}</p>}
    </div>
  );
}
