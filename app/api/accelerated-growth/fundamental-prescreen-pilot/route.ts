import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getAgSelectorBiasDiagnostic } from "@/lib/discovery/accelerated-growth/discovery";
import { getAcceleratedGrowthFundamentals } from "@/lib/discovery/accelerated-growth/fundamentals";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Research-only pilot: max 24 symbols, two cached quarterly FMP series per symbol.
// Never feeds the production selector, Committee, decisions, or portfolio.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const diagnostic = await getAgSelectorBiasDiagnostic();
    const baseline = diagnostic.selected;
    const control = diagnostic.sectorCoverageControl.selected;
    const baselineSymbols = new Set(baseline.map((item) => item.ticker));
    const controlSymbols = new Set(control.map((item) => item.ticker));
    // Stable order and equal budget for both arms; shared symbols excluded to isolate selector differences.
    const order = (a: { selectorScore: number; ticker: string }, b: { selectorScore: number; ticker: string }) =>
      b.selectorScore - a.selectorScore || a.ticker.localeCompare(b.ticker);
    const baselineOnly = baseline.filter((item) => !controlSymbols.has(item.ticker)).sort(order).slice(0, 12);
    const controlOnly = control.filter((item) => !baselineSymbols.has(item.ticker)).sort(order).slice(0, 12);
    const selected = [
      ...baselineOnly.map((item) => ({ ...item, arm: "BASELINE_ONLY" })),
      ...controlOnly.map((item) => ({ ...item, arm: "CONTROL_ONLY" })),
    ];
    const snapshotHash = createHash("sha256").update(JSON.stringify(selected)).digest("hex");
    const results: Array<{
      ticker: string; arm: string; bucket: string; selectorScore: number;
      eligibleForScoring: boolean | null; comparableGrowthPoints: number | null;
      latestRevenueGrowthYoY: number | null; revenueGrowthSlope: number | null;
      operatingMargin: number | null; freeCashFlowMargin: number | null;
      accelerationDirection: string | null; error: string | null;
    }> = [];
    // Sequential requests avoid a burst of up to 48 vendor calls.
    for (const item of selected) {
      try {
        const data = await getAcceleratedGrowthFundamentals(item.ticker);
        results.push({
          ticker: item.ticker, arm: item.arm, bucket: item.marketCapBucket,
          selectorScore: item.selectorScore,
          eligibleForScoring: data.dataQuality.eligibleForScoring,
          comparableGrowthPoints: data.dataQuality.comparableRevenueGrowthPoints,
          latestRevenueGrowthYoY: data.revenueTrajectory.latest,
          revenueGrowthSlope: data.revenueTrajectory.slope,
          operatingMargin: data.operatingMarginTrajectory.latest,
          freeCashFlowMargin: data.freeCashFlowMarginTrajectory.latest,
          accelerationDirection: data.accelerationDirection,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown FMP error";
        results.push({
          ticker: item.ticker, arm: item.arm, bucket: item.marketCapBucket,
          selectorScore: item.selectorScore, eligibleForScoring: null,
          comparableGrowthPoints: null, latestRevenueGrowthYoY: null,
          revenueGrowthSlope: null, operatingMargin: null, freeCashFlowMargin: null,
          accelerationDirection: null, error: message,
        });
        if (/status 429|rate limit|limit reach/i.test(message)) break;
      }
    }
    // Eligibility is a strict gate. Growth is contextual, not a BUY or Committee score.
    const growthCandidate = (row: typeof results[number]) =>
      row.eligibleForScoring === true &&
      row.latestRevenueGrowthYoY != null && row.latestRevenueGrowthYoY >= 8 &&
      row.revenueGrowthSlope != null && row.revenueGrowthSlope > 0 &&
      row.operatingMargin != null && row.operatingMargin > 0;
    const summarize = (arm: string) => {
      const rows = results.filter((row) => row.arm === arm);
      return {
        sampled: selected.filter((row) => row.arm === arm).length,
        completed: rows.length,
        sufficientHistory: rows.filter((row) => row.eligibleForScoring === true).length,
        insufficientHistory: rows.filter((row) => row.eligibleForScoring === false).length,
        preliminaryGrowthCandidates: rows.filter(growthCandidate).length,
        errors: rows.filter((row) => row.error).length,
      };
    };
    return NextResponse.json({
      mode: "READ_ONLY_AG_FUNDAMENTAL_PRESCREEN_PILOT",
      sampledAt: new Date().toISOString(),
      eligibleUniverseCount: diagnostic.eligibleCount,
      selectionFingerprint: snapshotHash,
      sampling: "Up to 12 unique selections per selector, ranked by existing liquidity/price selector score; no full-universe scan",
      growthCandidateDefinition: "8%+ latest YoY revenue growth, positive growth slope, positive operating margin, sufficient quarterly history",
      caveat: "Descriptive pilot only; growthCandidate is not ADVANCE or BUY. No complete frozen universe, no quality/valuation/earnings assessment. Up to 48 FMP quarterly series requests, subject to cache.",
      baseline: summarize("BASELINE_ONLY"),
      sectorCoverageControl: summarize("CONTROL_ONLY"),
      results: results.map((row) => ({ ...row, preliminaryGrowthCandidate: growthCandidate(row) })),
      decisionsWritten: false, transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Pilot failed" }, { status: 500 });
  }
}
