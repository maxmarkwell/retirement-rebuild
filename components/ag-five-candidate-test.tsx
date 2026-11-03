"use client";
import { useState } from "react";

type Scan = {
  id: string; stage: string; status: string; total: number;
  discoveryCompleted: number; deepCompleted: number; qualified: number | null;
  symbols: string[]; requiresReconciliation: boolean;
  poolCompleted?: number | null; poolTotal?: number | null; poolQualified?: number | null;
  selectionMethod?: string | null;
  poolRanking?: Array<{ symbol:string; status:string; path:string|null; score:number|null }>;
  committeeCompleted: number; committeeTotal: number;
  committeeResults: Array<{symbol:string;decision:string;rationale:string;ownershipThesis:string}>;
};
export default function AgFiveCandidateTest() {
  const [input, setInput] = useState("");
  const [targetTicker, setTargetTicker] = useState("SIMO");
  const [scan, setScan] = useState<Scan | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [identityDiagnostics, setIdentityDiagnostics] = useState<Record<string, unknown>>({});
  const [identityBusy, setIdentityBusy] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Record<string, {original:{decision:string;rationale:string};revised:{decision:string;rationale:string;valuationIntegrity:string;valuationConflicts:string[];ownershipNowVsWait:string;decisionBasis:string};note:string}>>({});
  const [comparing, setComparing] = useState<string | null>(null);
  const [suggestionNote, setSuggestionNote] = useState<string | null>(null);
  const symbols = input.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const valid = symbols.length === 5 && new Set(symbols).size === 5 &&
    symbols.every(s => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s));

  async function suggestShortlist() {
    if (busy || suggesting) return;
    setSuggesting(true); setError(null);
    try {
      const response = await fetch("/api/accelerated-growth/opportunity-scan", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "suggest" }), cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to generate shortlist.");
      if (!Array.isArray(data.symbols) || data.symbols.length !== 5)
        throw new Error("Shortlist response was incomplete.");
      setInput(data.symbols.join(", "));
      setSuggestionNote(data.warning);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Shortlist unavailable."); }
    finally { setSuggesting(false); }
  }

  async function request(action: "start" | "start_targeted" | "start_pool" | "next" | "refresh") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await fetch("/api/accelerated-growth/opportunity-scan" +
        (action === "refresh" ? `?id=${encodeURIComponent(scan?.id ?? resumeId)}` : ""), {
        method: action === "refresh" ? "GET" : "POST",
        headers: action === "refresh" ? undefined : { "content-type": "application/json" },
        body: action === "refresh" ? undefined : JSON.stringify(
          action === "start" ? { action, symbols } : action === "start_targeted" ? { action, symbols: [targetTicker.trim().toUpperCase()] } : { action, id: scan?.id }),
        cache: "no-store",
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "Research step failed.");
      setScan(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm research status.");
    } finally { setBusy(false); }
  }
  async function inspectIdentity(symbol: string) {
    if (identityBusy || busy) return;
    setIdentityBusy(symbol); setError(null);
    try {
      const response = await fetch("/api/accelerated-growth/valuation-identity?symbol=" + encodeURIComponent(symbol), {cache:"no-store"});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Identity inspection failed.");
      setIdentityDiagnostics(prev => ({...prev, [symbol]:data}));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Identity inspection unavailable."); }
    finally { setIdentityBusy(null); }
  }
  async function compare(symbol: string) {
    if (busy || comparing) return;
    setComparing(symbol); setError(null);
    try {
      const response = await fetch("/api/accelerated-growth/committee-compare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({symbol}), cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Comparison failed.");
      setComparison(prev => ({...prev, [symbol]: data}));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Comparison unavailable."); }
    finally { setComparing(null); }
  }
  const isAuditScan = scan?.id === "90a8c1d9-3746-438a-979e-8c16ce2ca264";
  const finished = scan?.stage === "ag_v2_committee_complete" || scan?.stage === "ag_v2_pool_insufficient";
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Five-candidate opportunity research test">
    <h2 className="text-lg font-bold text-slate-900">Five-candidate research test · v2</h2>
    <p className="mt-2 text-sm text-slate-600">Test the new five-path Discovery and independent Deep Research. This is separate from the legacy daily cycle. Committee research decisions are recorded here; no trades are generated.</p>
    {!scan ? <>
      <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50 p-3">
        <label htmlFor="ag-target-ticker" className="block text-sm font-semibold text-teal-950">Research one identified opportunity</label>
        <p className="mt-1 text-xs text-teal-900">Start a new paper-only AG Discovery, Deep Research, and Committee v3 sequence for a US-exchange-listed ticker, including eligible USD-traded ADSs. Listing and tradability must pass verification; qualification is not guaranteed.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input id="ag-target-ticker" value={targetTicker} onChange={e => setTargetTicker(e.target.value.toUpperCase())}
            maxLength={15} className="min-w-0 flex-1 rounded border border-teal-300 px-3 py-2 text-sm" placeholder="SIMO"/>
          <button type="button" disabled={busy || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(targetTicker.trim())}
            onClick={() => void request("start_targeted")}
            className="rounded bg-teal-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Starting…" : "Start single-company research"}</button>
        </div>
      </div>
      <label htmlFor="ag-v2-symbols" className="mt-4 block text-sm font-semibold text-slate-800">Five unique eligible stock tickers, comma-separated</label>
      <input id="ag-v2-symbols" value={input} onChange={e => setInput(e.target.value)}
        placeholder="TICKER1, TICKER2, TICKER3, TICKER4, TICKER5"
        className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"/>
      <p className="mt-2 text-xs text-slate-600">This is a technical research test. You can enter five tickers or generate an exploratory shortlist. Automatic investment-opportunity ranking is not yet implemented.</p>
      <button type="button" disabled={busy || suggesting} onClick={() => void suggestShortlist()} className="mt-3 mr-2 rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold disabled:opacity-40">{suggesting ? "Selecting…" : "Suggest five test companies"}</button>
      {suggestionNote && <p role="status" className="mt-2 text-xs font-medium text-amber-800">{suggestionNote}</p>}
      <button type="button" disabled={busy} onClick={() => void request("start_pool")} className="mt-3 mr-2 rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Starting…" : "Research a pool and rank five"}</button>
      <p className="mt-2 text-xs text-slate-600">Evidence-ranked mode checks twelve broadly sampled eligible companies, one call at a time, then advances only the five highest-qualified research candidates. If fewer than five qualify, it stops without forcing a shortlist.</p>
      <button type="button" disabled={!valid || busy} onClick={() => void request("start")}
        className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Starting…" : "Start five-candidate test"}</button>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <label htmlFor="ag-v2-resume" className="block text-sm font-semibold text-slate-800">Resume an existing scan by ID</label>
        <div className="mt-2 flex flex-wrap gap-2"><input id="ag-v2-resume" value={resumeId} onChange={e => setResumeId(e.target.value)} placeholder="Saved scan UUID" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"/><button type="button" disabled={busy || !/^[0-9a-f-]{36}$/i.test(resumeId)} onClick={() => void request("refresh")} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold disabled:opacity-40">Load scan</button></div>
      </div>
    </> : <>
      <p className="mt-3 text-sm font-semibold text-slate-800">Saved scan {scan.id}</p>
      <p className="mt-1 text-sm text-slate-700">Stage: {scan.stage} · Status: {scan.status}</p>
      {scan.poolTotal != null && <p className="mt-1 text-sm font-semibold text-slate-800">Evidence pool: {scan.poolCompleted ?? 0}/{scan.poolTotal} · {scan.poolQualified != null ? `${scan.poolQualified} qualified` : "ranking pending"}</p>}
      <p className="mt-1 text-sm text-slate-700">Discovery: {scan.discoveryCompleted}/{scan.total} · Qualified: {scan.qualified ?? "Pending"} · Independent Deep Research: {scan.deepCompleted}/{scan.qualified ?? "Pending"}</p>
      {scan.selectionMethod && <p className="mt-1 text-xs text-slate-600">Candidate selection: {scan.selectionMethod}</p>}
      {(scan.poolRanking?.length ?? 0) > 0 && <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-800">Inspect all pool candidates and Discovery scores</summary><p className="mt-2 text-xs text-slate-500">Research-priority scores reflect reported opportunity evidence, not expected returns or BUY recommendations.</p><ul className="mt-2 space-y-1">{scan.poolRanking!.map(r => <li key={r.symbol} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1"><span className="font-semibold">{r.symbol} · {r.status}</span><span>{r.path?.replaceAll("_", " ") ?? "No qualifying path"} · {r.score == null ? "Not ranked" : `Score ${r.score.toFixed(1)}`}</span></li>)}</ul></details>}
      {scan.stage === "ag_v2_pool_insufficient" && <p className="mt-2 font-medium text-amber-800">Fewer than five companies qualified. This pool is complete; no candidates were forced forward.</p>}
      <p className="mt-1 text-xs text-slate-600">{scan.symbols.join(", ")}</p>
      <p className="mt-2 text-sm font-medium text-slate-800">Committee: {scan.committeeCompleted ?? 0}/{scan.committeeTotal ?? 0} · Research decisions only</p>
      {(scan.committeeResults ?? []).map(result => <details key={result.symbol} className="mt-2 rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-bold">{result.symbol} · {result.decision}</summary><p className="mt-2 font-semibold">{result.ownershipThesis}</p><p className="mt-2 whitespace-pre-wrap">{result.rationale}</p></details>)}
      {isAuditScan && <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-bold text-amber-950">MAIR / MAIRE security-identity diagnostic</h3>
        <p className="mt-2 text-xs text-amber-900">Read-only vendor inspection. Compare the original scan symbol MAIR against the primary-listing ticker MAIRE. Prices may be from different dates. No Committee evaluation or trading.</p>
        <div className="mt-3 flex flex-wrap gap-2">{["MAIR","MAIRE"].map(symbol =>
          <button key={symbol} type="button" disabled={!!identityBusy || busy} onClick={() => void inspectIdentity(symbol)}
            className="rounded border border-amber-500 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">{identityBusy === symbol ? "Inspecting…" : "Inspect " + symbol}</button>)}</div>
        {Object.entries(identityDiagnostics).map(([symbol,data]) => <details key={symbol} open className="mt-3 rounded border border-amber-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-bold">{symbol} vendor diagnostics</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs">{JSON.stringify(data,null,2)}</pre>
        </details>)}
      </section>}
      {isAuditScan && scan.stage === "ag_v2_committee_complete" && <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <h3 className="font-bold text-indigo-950">Independent Committee v3 comparison · saved historical dossiers</h3>
        <p className="mt-2 text-xs text-indigo-900">One model call per company; original decisions are never changed. Historical valuation input is the saved original Committee assessment, NOT the original raw valuation snapshot. This compares historical v1 decisions with a new v3 judgment using saved valuation prose, not an identical v2-v3 replay or a current investment recommendation. MAIR is excluded because its saved research and valuation concern different issuers.</p>
        <div className="mt-3 flex flex-wrap gap-2">{["TLS","BILL","GH","COLM"].map(symbol =>
          <button type="button" key={symbol} disabled={busy || !!comparing} onClick={() => void compare(symbol)}
            className="rounded-lg border border-indigo-400 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">{comparing === symbol ? "Evaluating…" : "Compare " + symbol}</button>)}</div>
        {Object.entries(comparison).map(([symbol,item]) => <details key={symbol} open className="mt-3 rounded-lg border border-indigo-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-bold">{symbol}: original {item.original.decision} / revised {item.revised.decision}</summary>
          <p className="mt-2 font-semibold">Original Committee reasoning</p><p className="whitespace-pre-wrap">{item.original.rationale}</p>
          <p className="mt-3 font-semibold">Revised Committee reasoning</p><p className="whitespace-pre-wrap">{item.revised.rationale}</p>
          <p className="mt-2"><strong>Valuation integrity:</strong> {item.revised.valuationIntegrity} · <strong>Primary issue:</strong> {item.revised.decisionBasis}</p>
          <p className="mt-2 font-semibold">Own now versus wait</p><p>{item.revised.ownershipNowVsWait}</p>
          {!!item.revised.valuationConflicts?.length && <p className="mt-2"><strong>Valuation conflicts:</strong> {item.revised.valuationConflicts.join("; ")}</p>}
          <p className="mt-2 text-xs text-slate-600">{item.note}</p>
        </details>)}
      </section>}
      {scan.requiresReconciliation && <p role="alert" className="mt-3 text-sm font-semibold text-amber-800">The previous research call was claimed but not confirmed saved. Manual reconciliation required; do not repeat it.</p>}
      {finished && <p role="status" className="mt-3 font-semibold text-green-800">Discovery, Deep Research, and independent Committee results are saved for this scan. No trades were authorized.</p>}
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
