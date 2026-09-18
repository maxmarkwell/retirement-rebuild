"use client";

import { useState } from "react";

export default function AgCommitteePersistTestPage() {
  const [status, setStatus] = useState("Ready. This writes AG Committee decisions only; it does not create transactions.");
  const [result, setResult] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setStatus("Running Discovery → Catalyst → Deep Research → Committee…");
    setResult(null);
    try {
      const response = await fetch("/api/accelerated-growth/committee-persist?max=5", { method: "POST" });
      const json = await response.json();
      setResult(json);
      setStatus(response.ok ? "Complete. Review the persisted decisions below." : "Stopped without trade execution. Review the response below.");
    } catch (error) {
      setStatus("Request failed.");
      setResult({ error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AG Committee Persistence Test</h1>
        <p className="mt-2 text-sm text-gray-600">{status}</p>
      </div>
      <button
        type="button"
        disabled={running}
        onClick={run}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {running ? "Running…" : "Run AG Committee + Persist Decisions"}
      </button>
      <p className="text-sm font-medium text-amber-700">
        This test may write investment_decisions. It does not call the AG paper executor and does not write transactions.
      </p>
      {result !== null && (
        <pre className="overflow-auto whitespace-pre-wrap rounded border bg-gray-50 p-4 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
