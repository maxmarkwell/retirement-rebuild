import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getAgSelectorBiasDiagnostic } from "@/lib/discovery/accelerated-growth/discovery";
import { getAcceleratedGrowthFundamentals } from "@/lib/discovery/accelerated-growth/fundamentals";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Fixed membership only: financial statements can still change upstream.
const FIXED_COHORT_ID = "2026-10-20T15:47:52.208Z";
const FIXED_COHORT = {
  BASELINE_ONLY: [
    ["AXTI","mid"],["BRZE","mid"],["HAS","large"],["NKE","large"],
    ["NVDA","mega"],["SMCI","large"],["SNDK","large"],["UNH","mega"],
    ["VICR","mid"],["VRNS","mid"],["ALK","mid"],["AEHR","mid"],
  ],
  CONTROL_ONLY: [
    ["AMZN","mega"],["ASTS","large"],["BKNG","large"],["GOOG","mega"],
    ["HAL","large"],["PEP","large"],["FPS","mid"],["HIMS","mid"],
    ["WH","mid"],["CLF","mid"],["OKLO","mid"],["PBF","mid"],
  ],
} as const;

// Research-only pilot: max 24 symbols, two cached quarterly FMP series per symbol.
// Never feeds the production selector, Committee, decisions, or portfolio.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const fixedCohort = new URL(request.url).searchParams.get("cohort") === "fixed-20261020";
    const diagnostic = fixedCohort ? null : await getAgSelectorBiasDiagnostic();
    const baseline = diagnostic?.selected ?? [];
    const control = diagnostic?.sectorCoverageControl.selected ?? [];
    const baselineSymbols = new Set(baseline.map((item) => item.ticker));
    const controlSymbols = new Set(control.map((item) => item.ticker));
    // Stable order and equal budget for both arms; shared symbols excluded to isolate selector differences.
    const order = (a: { selectorScore: number; ticker: string }, b: { selectorScore: number; ticker: string }) =>
      b.selectorScore - a.selectorScore || a.ticker.localeCompare(b.ticker);
    const baselineOnly = baseline.filter((item) => !controlSymbols.has(item.ticker)).sort(order).slice(0, 12);
    const controlOnly = control.filter((item) => !baselineSymbols.has(item.ticker)).sort(order).slice(0, 12);
    const liveSelected = [
      ...baselineOnly.map((item) => ({ ...item, arm: "BASELINE_ONLY" })),
      ...controlOnly.map((item) => ({ ...item, arm: "CONTROL_ONLY" })),
    ];
    const selected = fixedCohort
      ? Object.entries(FIXED_COHORT).flatMap(([arm, members]) =>
          members.map(([ticker, marketCapBucket]) => ({ ticker, marketCapBucket, selectorScore: null as number | null, arm })))
      : liveSelected;
    const snapshotHash = createHash("sha256").update(JSON.stringify(
      fixedCohort ? { cohort: FIXED_COHORT_ID, members: FIXED_COHORT } : selected
    )).digest("hex");
    const results: Array<{
      ticker: string; arm: string; bucket: string; selectorScore: number | null;
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
    // Advisory only: these flags do not modify the original preliminary-growth definition.
    // They indicate cases that need manual source validation or cash-conversion review.
    const qualityFlags = (row: typeof results[number]): string[] => {
      if (row.error || row.eligibleForScoring !== true) return [];
      const flags: string[] = [];
      if (row.operatingMargin != null && Math.abs(row.operatingMargin) > 100)
        flags.push("EXTREME_OPERATING_MARGIN");
      if (row.freeCashFlowMargin != null && Math.abs(row.freeCashFlowMargin) > 100)
        flags.push("EXTREME_FREE_CASH_FLOW_MARGIN");
      if (row.latestRevenueGrowthYoY != null && Math.abs(row.latestRevenueGrowthYoY) > 300)
        flags.push("EXTREME_REVENUE_GROWTH_BASE_EFFECT");
      if (row.operatingMargin != null && row.freeCashFlowMargin != null &&
          row.operatingMargin > 0 && row.freeCashFlowMargin < -15)
        flags.push("OPERATING_PROFIT_WITH_NEGATIVE_FCF");
      if (row.operatingMargin != null && row.freeCashFlowMargin != null &&
          row.operatingMargin > 60 && row.freeCashFlowMargin > 60)
        flags.push("UNUSUALLY_HIGH_DUAL_MARGINS_VERIFY_SOURCE");
      return flags;
    };
    const summarize = (arm: string) => {
      const rows = results.filter((row) => row.arm === arm);
      return {
        sampled: selected.filter((row) => row.arm === arm).length,
        completed: rows.length,
        sufficientHistory: rows.filter((row) => row.eligibleForScoring === true).length,
        insufficientHistory: rows.filter((row) => row.eligibleForScoring === false).length,
        preliminaryGrowthCandidates: rows.filter(growthCandidate).length,
        flaggedGrowthCandidates: rows.filter((row) => growthCandidate(row) && qualityFlags(row).length > 0).length,
        unflaggedGrowthCandidates: rows.filter((row) => growthCandidate(row) && qualityFlags(row).length === 0).length,
        errors: rows.filter((row) => row.error).length,
      };
    };
    return NextResponse.json({
      mode: "READ_ONLY_AG_FUNDAMENTAL_PRESCREEN_PILOT",
      sampledAt: new Date().toISOString(),
      eligibleUniverseCount: diagnostic?.eligibleCount ?? null,
      cohortMode: fixedCohort ? "FIXED_MEMBERSHIP_REPLAY" : "LIVE_SELECTOR_SAMPLE",
      fixedCohortId: fixedCohort ? FIXED_COHORT_ID : null,
      selectionFingerprint: snapshotHash,
      sampling: fixedCohort ? "Exact 24 ticker/arm memberships from the 2026-10-20 15:47:52 UTC run; selector scores not replayed" : "Up to 12 unique selections per selector, ranked by existing liquidity/price selector score; no full-universe scan",
      growthCandidateDefinition: "8%+ latest YoY revenue growth, positive growth slope, positive operating margin, sufficient quarterly history",
      caveat: "Descriptive pilot only; growthCandidate is not ADVANCE or BUY. Fixed replay freezes ticker membership, NOT historical FMP statement versions or full universe. No quality/valuation/earnings assessment. Up to 48 FMP quarterly series requests, subject to cache.",
      baseline: summarize("BASELINE_ONLY"),
      sectorCoverageControl: summarize("CONTROL_ONLY"),
      qualityFlagPolicy: "Advisory heuristic only. Extreme percentages can reflect small denominators or source errors; negative FCF can be investment-related. Verify filings before action.",
      results: results.map((row) => ({ ...row, preliminaryGrowthCandidate: growthCandidate(row), qualityFlags: qualityFlags(row) })),
      decisionsWritten: false, transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Pilot failed" }, { status: 500 });
  }
}
