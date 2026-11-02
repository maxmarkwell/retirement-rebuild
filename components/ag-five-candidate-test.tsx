"use client";
import { useState } from "react";

type Scan = {
  id: string; stage: string; status: string; total: number;
  discoveryCompleted: number; deepCompleted: number; qualified: number | null;
  symbols: string[]; requiresReconciliation: boolean;
  committeeCompleted: number; committeeTotal: number;
  committeeResults: Array<{symbol:string;decision:string;rationale:string;ownershipThesis:string}>;
};
export default function AgFiveCandidateTest() {
  const [input, setInput] = useState("");
  const [scan, setScan] = useState<Scan | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const symbols = input.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const valid = symbols.length === 5 && new Set(symbols).size === 5 &&
    symbols.every(s => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s));

  async function request(action: "start" | "next" | "refresh") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await fetch("/api/accelerated-growth/opportunity-scan" +
        (action === "refresh" ? `?id=${encodeURIComponent(scan?.id ?? resumeId)}` : ""), {
        method: action === "refresh" ? "GET" : "POST",
        headers: action === "refresh" ? undefined : { "content-type": "application/json" },
        body: action === "refresh" ? undefined : JSON.stringify(
          action === "start" ? { action, symbols } : { action, id: scan?.id }),
        cache: "no-store",
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "Research step failed.");
      setScan(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm research status.");
    } finally { setBusy(false); }
  }
  const finished = scan?.stage === "ag_v2_committee_complete";
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Five-candidate opportunity research test">
    <h2 className="text-lg font-bold text-slate-900">Five-candidate research test · v2</h2>
    <p className="mt-2 text-sm text-slate-600">Test the new five-path Discovery and independent Deep Research. This is separate from the legacy daily cycle. Committee research decisions are recorded here; no trades are generated.</p>
    {!scan ? <>
      <label htmlFor="ag-v2-symbols" className="mt-4 block text-sm font-semibold text-slate-800">Five unique eligible stock tickers, comma-separated</label>
      <input id="ag-v2-symbols" value={input} onChange={e => setInput(e.target.value)}
        placeholder="TICKER1, TICKER2, TICKER3, TICKER4, TICKER5"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"/>
      <p className="mt-2 text-xs text-slate-600">This test requires an explicit shortlist; automatic five-path candidate selection is not yet connected. Eligible symbols are verified on the server.</p>
      <button type="button" disabled={!valid || busy} onClick={() => void request("start")}
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Starting…" : "Start five-candidate test"}</button>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <label htmlFor="ag-v2-resume" className="block text-sm font-semibold text-slate-800">Resume an existing scan by ID</label>
        <div className="mt-2 flex flex-wrap gap-2"><input id="ag-v2-resume" value={resumeId} onChange={e => setResumeId(e.target.value)} placeholder="Saved scan UUID" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"/><button type="button" disabled={busy || !/^[0-9a-f-]{36}$/i.test(resumeId)} onClick={() => void request("refresh")} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold disabled:opacity-40">Load scan</button></div>
      </div>
    </> : <>
      <p className="mt-3 text-sm font-semibold text-slate-800">Saved scan {scan.id}</p>
      <p className="mt-1 text-sm text-slate-700">Stage: {scan.stage} · Status: {scan.status}</p>
      <p className="mt-1 text-sm text-slate-700">Discovery: {scan.discoveryCompleted}/{scan.total} · Qualified: {scan.qualified ?? "Pending"} · Independent Deep Research: {scan.deepCompleted}/{scan.qualified ?? "Pending"}</p>
      <p className="mt-1 text-xs text-slate-600">{scan.symbols.join(", ")}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">Committee: {scan.committeeCompleted ?? 0}/{scan.committeeTotal ?? 0} · Research decisions only</p>
      {(scan.committeeResults ?? []).map(result => <details key={result.symbol} className="mt-2 rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-bold">{result.symbol} · {result.decision}</summary><p className="mt-2 font-semibold">{result.ownershipThesis}</p><p className="mt-2 whitespace-pre-wrap">{result.rationale}</p></details>)}
      {scan.requiresReconciliation && <p role="alert" className="mt-3 text-sm font-semibold text-amber-800">The previous research call was claimed but not confirmed saved. Manual reconciliation required; do not repeat it.</p>}
      {finished && <p role="status" className="mt-3 font-semibold text-green-800">Five-candidate Discovery, Deep Research, and independent Committee results are saved. No trades were authorized.</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void request("refresh")} disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40">Refresh saved status</button>
        {!finished && !scan.requiresReconciliation && <button type="button" onClick={() => void request("next")} disabled={busy}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Processing…" : scan.stage === "ag_v2_deep_complete" ? "Process next Committee decision" : "Process next step"}</button>}
      </div>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error} Refresh saved status before trying another action.</p>}
    <p className="mt-4 text-xs text-slate-500">Each step makes at most one independent candidate research call; there is no automatic replay, auto-execution, or funding action. Save this page or scan ID to continue later.</p>
  </section>;
}
