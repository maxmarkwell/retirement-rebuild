"use client";

import { useEffect, useState } from "react";

type Original = { id: string; ticker: string; decision_type: string; thesis: string | null };
type Comparison = { id: string; ticker: string; original_decision_id: string; reassessed_decision_type: string; reassessment_rationale: string; valuation_data_quality: string; research_basis: string };
const ORDER = ["AMAT", "INOD", "SNX", "QMCO", "AXTI", "COP", "RGR"];

export default function AgHistoricalReassessmentControl() {
  const [originals, setOriginals] = useState<Original[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<{ decision: { decision: string; promptVersion: string; valuationEvidence: string; committeeRationale: string }; valuationSnapshot: { ttmFreeCashFlow: number | null; cashConversionDiagnostic: unknown; cashFlowBreakdown: unknown[]; limitations: string[] } } | null>(null);

  async function refresh() {
    const response = await fetch("/api/accelerated-growth/historical-reassessments", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load historical decisions.");
    setOriginals(body.originalDecisions ?? []);
    setComparisons(body.reassessments ?? []);
    setLoaded(true);
  }

  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : String(e))); }, []);

  async function run(ticker: string) {
    setBusy(ticker);
    setError(null);
    try {
      const response = await fetch("/api/accelerated-growth/historical-reassessments/run", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Reassessment failed.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reassessment failed.");
      // The server may have saved a result before the connection failed.
      await refresh().catch(() => {});
    } finally { setBusy(null); }
  }

  async function previewInod() {
    setBusy("INOD_PREVIEW"); setError(null); setPreview(null);
    try {
      const response = await fetch("/api/accelerated-growth/historical-reassessments/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: "INOD" }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "INOD preview failed.");
      setPreview(body);
    } catch (e) { setError(e instanceof Error ? e.message : "INOD preview failed."); }
    finally { setBusy(null); }
  }

  return <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
    <h2 className="text-lg font-bold text-gray-900">Historical Committee Reassessment</h2>
    <p className="mt-2 text-sm text-gray-600">Paper research only. Compare October 16 WATCH decisions with a new valuation-informed committee judgment. Original decisions stay unchanged. The original full research dossiers were not saved; comparisons use reconstructed historical context, not fresh full research.</p>
    {error && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!loaded && !error && <p className="mt-3 text-sm text-gray-500">Loading historical decisions…</p>}
    <div className="mt-4 space-y-3">
      {ORDER.map(ticker => {
        const original = originals.find(x => x.ticker === ticker);
        const comparison = comparisons.find(x => x.ticker === ticker && x.original_decision_id === original?.id);
        return <div key={ticker} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><span className="font-bold text-slate-900">{ticker}</span><span className="ml-3 text-sm font-medium text-gray-700">Original: {original?.decision_type?.toUpperCase() ?? "Not found"}{comparison ? ` → Reassessed: ${comparison.reassessed_decision_type}` : ""}</span></div>
            <button type="button" onClick={() => void run(ticker)} disabled={!original || !!comparison || busy !== null} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === ticker ? "Reassessing…" : comparison ? "Completed" : "Reassess"}</button>
          </div>
          {ticker === "INOD" && comparison && <button type="button" onClick={() => void previewInod()} disabled={busy !== null} className="mt-3 rounded-md border border-slate-500 bg-white px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-40">{busy === "INOD_PREVIEW" ? "Running read-only v8 preview…" : "Run read-only INOD v8 preview"}</button>}
          {ticker === "INOD" && preview && <div className="mt-3 rounded-md border border-blue-200 bg-white p-3 text-sm text-slate-800">
            <p className="font-semibold">Read-only committee preview: {preview.decision.decision} · {preview.decision.promptVersion}</p>
            <p className="mt-2">{preview.decision.committeeRationale}</p>
            <p className="mt-2 whitespace-pre-wrap">{preview.decision.valuationEvidence}</p>
            <details className="mt-3"><summary className="cursor-pointer font-semibold">Quarterly cash-flow and working-capital diagnostics</summary><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify({ ttmFreeCashFlow: preview.valuationSnapshot.ttmFreeCashFlow, cashConversionDiagnostic: preview.valuationSnapshot.cashConversionDiagnostic, cashFlowBreakdown: preview.valuationSnapshot.cashFlowBreakdown, limitations: preview.valuationSnapshot.limitations }, null, 2)}</pre></details>
            <p className="mt-2 text-xs text-slate-600">Reconstructed historical research; no decisions or trades saved.</p>
          </div>}
          {comparison && <><p className="mt-2 text-sm text-gray-700">{comparison.reassessment_rationale}</p><p className="mt-2 text-xs text-gray-500">Valuation evidence: {comparison.valuation_data_quality} · {comparison.research_basis.replaceAll("_", " ")}</p></>}
        </div>;
      })}
    </div>
  </section>;
}
