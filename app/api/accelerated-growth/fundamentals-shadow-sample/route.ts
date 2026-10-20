import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgSelectorBiasDiagnostic } from "@/lib/discovery/accelerated-growth/discovery";
import { evaluateAcceleratedGrowthCandidate } from "@/lib/discovery/accelerated-growth/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Explicitly invoked, authenticated research-only experiment. Never writes decisions or trades.
// A single request evaluates at most twelve companies; each uses existing cached FMP endpoints.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const diagnostic = await getAgSelectorBiasDiagnostic();
    const baseline = diagnostic.selected;
    const control = diagnostic.sectorCoverageControl.selected;
    const baselineSet = new Set(baseline.map((item) => item.ticker));
    const controlSet = new Set(control.map((item) => item.ticker));
    const bucketQuotas = { small: 2, mid: 2, large: 1, mega: 1 } as const;
    const pick = (items: Array<{ ticker: string; marketCapBucket: string; selectorScore: number }>) =>
      Object.entries(bucketQuotas).flatMap(([bucket, count]) =>
        items.filter((item) => item.marketCapBucket === bucket)
          .sort((a, b) => b.selectorScore - a.selectorScore || a.ticker.localeCompare(b.ticker))
          .slice(0, count).map((item) => item.ticker)
      );
    const baselineSample = pick(baseline.filter((item) => !controlSet.has(item.ticker)));
    const controlSample = pick(control.filter((item) => !baselineSet.has(item.ticker)));
    const sample = [
      ...baselineSample.map((ticker) => ({ ticker, arm: "BASELINE_ONLY" })),
      ...controlSample.map((ticker) => ({ ticker, arm: "CONTROL_ONLY" })),
    ];
    const results: Array<Record<string, unknown>> = [];
    // Small fixed concurrency prevents a 12-symbol burst of upstream requests.
    for (let i = 0; i < sample.length; i += 2) {
      const batch = await Promise.all(sample.slice(i, i + 2).map(async ({ ticker, arm }) => {
        try {
          const result = await evaluateAcceleratedGrowthCandidate(ticker);
          return {
            ticker, arm, status: result.score.status, total: result.score.total,
            components: result.score.components,
            dataQuality: result.acceleration.dataQuality,
            latestRevenueGrowthYoY: result.acceleration.revenueTrajectory.latest,
            revenueGrowthSlope: result.acceleration.revenueTrajectory.slope,
            operatingMargin: result.acceleration.operatingMarginTrajectory.latest,
            freeCashFlowMargin: result.acceleration.freeCashFlowMarginTrajectory.latest,
            error: null,
          };
        } catch (err) {
          return { ticker, arm, error: err instanceof Error ? err.message : "Evaluation failed" };
        }
      }));
      results.push(...batch);
    }
    const summary = (arm: string) => {
      const rows = results.filter((row) => row.arm === arm);
      return {
        requested: rows.length,
        evaluated: rows.filter((row) => !row.error).length,
        advance: rows.filter((row) => row.status === "ADVANCE").length,
        review: rows.filter((row) => row.status === "REVIEW").length,
        reject: rows.filter((row) => row.status === "REJECT").length,
        insufficientData: rows.filter((row) => row.status === "INSUFFICIENT_DATA").length,
        errors: rows.filter((row) => row.error).length,
      };
    };
    return NextResponse.json({
      mode: "READ_ONLY_FUNDAMENTALS_SHADOW_SAMPLE",
      sampledAt: new Date().toISOString(),
      universeCount: diagnostic.universeCount,
      eligibleCount: diagnostic.eligibleCount,
      sampling: "Unique selections only; highest selector score within 2 small, 2 mid, 1 large, 1 mega slots per arm",
      limitations: "Nonrandom, small matched-bucket sample. ADVANCE is quantitative research eligibility, not BUY. Do not infer investment returns or statistical significance.",
      baseline: summary("BASELINE_ONLY"),
      sectorCoverageControl: summary("CONTROL_ONLY"),
      results,
      decisionsWritten: false,
      transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Shadow sample failed" }, { status: 500 });
  }
}
