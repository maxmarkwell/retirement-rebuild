"use client";

import { useState } from "react";

export default function AgCommitteePersistTestPage() {
  const [status, setStatus] = useState("Ready. This writes AG Committee decisions only; it does not create transactions.");
  const [result, setResult] = useState<unknown>(null);
  const [running, setRunning] = useState(false);
  const [fixtureRunning, setFixtureRunning] = useState(false);
  const [dryRunRunning, setDryRunRunning] = useState(false);

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

  async function createBuyFixture() {
    setFixtureRunning(true);
    setStatus("Creating local AG BUY test fixture…");
    setResult(null);
    try {
      const response = await fetch("/api/accelerated-growth/buy-fixture", { method: "POST" });
      const json = await response.json();
      setResult(json);
      setStatus(response.ok ? "BUY fixture ready. No transaction was written." : "Fixture creation failed.");
    } catch (error) {
      setStatus("Fixture request failed.");
      setResult({ error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setFixtureRunning(false);
    }
  }

  async function runBuyDryRun() {
    setDryRunRunning(true);
    setStatus("Running zero-write AG BUY sizing diagnostic…");
    setResult(null);
    try {
      const fixtureResponse = await fetch("/api/accelerated-growth/buy-fixture", { method: "POST" });
      const fixture = await fixtureResponse.json();
      if (!fixtureResponse.ok || !fixture.decisionId) throw new Error(fixture.error ?? "Unable to resolve BUY fixture.");
      const response = await fetch(`/api/accelerated-growth/paper-execution-dry-run?decisionId=${encodeURIComponent(fixture.decisionId)}&price=100`);
      const json = await response.json();
      setResult(json);
      setStatus(response.ok ? "Dry run complete. No transaction was written." : "Dry run blocked. Review the response below.");
    } catch (error) {
      setStatus("Dry-run request failed.");
      setResult({ error: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setDryRunRunning(false);
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
      <button
        type="button"
        disabled={fixtureRunning || running}
        onClick={createBuyFixture}
        className="rounded border border-black px-4 py-2 disabled:opacity-50"
      >
        {fixtureRunning ? "Creating…" : "Create Deterministic AG BUY Fixture"}
      </button>
      <button
        type="button"
        disabled={dryRunRunning || fixtureRunning || running}
        onClick={runBuyDryRun}
        className="rounded border border-black px-4 py-2 disabled:opacity-50"
      >
        {dryRunRunning ? "Running…" : "Run Zero-Write AG BUY Dry Run"}
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
