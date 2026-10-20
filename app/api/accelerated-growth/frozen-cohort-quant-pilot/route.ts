import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { evaluateAcceleratedGrowthCandidate } from "@/lib/discovery/accelerated-growth/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Frozen from 2026-10-20 16:09:02.722Z universe snapshot.
// Baseline is a ticker-ordered PROXY, not a historical production replay.
// Membership intentionally fixed; live vendor financials are NOT frozen.
const SOURCE_HASH = "cac9edf9d353f9f009e076481fe2fc558911e220de6ec1769ea9c68c725b24bc";
const BASELINE = ["ALGT","BZH","CTRN","HZO","MYGN","RAPP","SHAZ","WHR","AAOI","BRZE","FPS","HIMS","MOD","OKLO","SOLS","VICR","ABT","FCX","LITE","SMCI","AAPL","KO"];
const CONTROL = ["RAPP","BZH","SHAZ","SMR","USAR","RUN","TPB","ZD","AAOI","FPS","HIMS","SOLS","WH","OKLO","PBF","CELH","FCX","ASTS","BKNG","PEP","GOOG","AMZN"];
const ALL = [...new Set([...BASELINE, ...CONTROL])].sort();
const BATCH_SIZE = 4;
const isRateLimit = (message: string) => /status 429|rate limit|limit reach/i.test(message);

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams;
  const rawBatch = query.get("batch") ?? "0";
  if (!/^(0|[1-9][0-9]*)$/.test(rawBatch)) return NextResponse.json({ error: "batch must be a nonnegative integer" }, { status: 400 });
  const batch = Number(rawBatch);
  const batchCount = Math.ceil(ALL.length / BATCH_SIZE);
  if (!Number.isSafeInteger(batch) || batch >= batchCount) return NextResponse.json({ error: `batch must be 0 through ${batchCount - 1}` }, { status: 400 });
  const symbols = ALL.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
  const results: Array<{ ticker: string; arms: string[]; status: string | null; score: number | null; eligible: boolean | null; components: Record<string, number | null> | null; gates: Record<string, boolean | null> | null; metrics: Record<string, number | string | null> | null; scoreVersion: string | null; audit: Record<string, unknown> | null; error: string | null }> = [];
  let rateLimited = false;
  for (const ticker of symbols) {
    const arms = [...(BASELINE.includes(ticker) ? ["BASELINE_PROXY"] : []), ...(CONTROL.includes(ticker) ? ["SECTOR_CONTROL"] : [])];
    try {
      const evaluated = await evaluateAcceleratedGrowthCandidate(ticker);
      results.push({ ticker, arms, status: evaluated.score.status, score: evaluated.score.total, eligible: evaluated.acceleration.dataQuality.eligibleForScoring, components: evaluated.score.components, scoreVersion: evaluated.score.version, audit: { quarters: evaluated.acceleration.quarters, revenueTrajectory: evaluated.acceleration.revenueTrajectory, operatingMarginTrajectory: evaluated.acceleration.operatingMarginTrajectory, freeCashFlowMarginTrajectory: evaluated.acceleration.freeCashFlowMarginTrajectory, qualityInputs: evaluated.quality, valuationInputs: evaluated.valuation, earningsInputs: evaluated.earnings, note: "Quarterly FMP data; date-match vs positional fallback is not exposed by the current fundamentals loader. Do not treat periods as verified." }, gates: { sufficientHistory: evaluated.acceleration.dataQuality.eligibleForScoring, totalAtLeast68: evaluated.score.total >= 68, accelerationAtLeast55: evaluated.score.components.fundamentalAcceleration >= 55, revenueGrowthAtLeast8: evaluated.acceleration.revenueTrajectory.latest == null ? null : evaluated.acceleration.revenueTrajectory.latest >= 8, severeDeterioration: evaluated.acceleration.accelerationDirection === "strongly_decelerating" || ((evaluated.acceleration.revenueTrajectory.latest ?? Infinity) < 0 && (evaluated.acceleration.revenueTrajectory.slope ?? Infinity) < -1), accelerationBelow30: evaluated.score.components.fundamentalAcceleration < 30 }, metrics: { latestRevenueGrowthYoY: evaluated.acceleration.revenueTrajectory.latest, revenueGrowthSlope: evaluated.acceleration.revenueTrajectory.slope, operatingMargin: evaluated.acceleration.operatingMarginTrajectory.latest, freeCashFlowMargin: evaluated.acceleration.freeCashFlowMarginTrajectory.latest, accelerationDirection: evaluated.acceleration.accelerationDirection, comparableRevenueGrowthPoints: evaluated.acceleration.dataQuality.comparableRevenueGrowthPoints }, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evaluation failed";
      results.push({ ticker, arms, status: null, score: null, eligible: null, components: null, gates: null, metrics: null, scoreVersion: null, audit: null, error: message });
      if (isRateLimit(message)) { rateLimited = true; break; }
    }
  }
  return NextResponse.json({
    mode: "READ_ONLY_FROZEN_COHORT_QUANT_PILOT",
    sourceSnapshotHash: SOURCE_HASH,
    capturedAt: "2026-10-20T16:09:02.722Z",
    evaluatedAt: new Date().toISOString(),
    cohortHash: createHash("sha256").update(JSON.stringify({ BASELINE, CONTROL })).digest("hex"),
    baselineType: "TICKER_ORDERED_PROXY_NOT_PRODUCTION_REPLAY",
    vendorStatementsFrozen: false,
    cohortSizes: { baseline: BASELINE.length, control: CONTROL.length, overlap: BASELINE.filter(s => CONTROL.includes(s)).length, unique: ALL.length },
    batch, batchCount, requested: symbols.length, completed: results.length, rateLimited, stoppedEarly: results.length < symbols.length,
    results,
    caveat: "Full existing quant scoring with component/gate diagnostics; quarter-level vendor values are not independently verified and cash-flow alignment is not yet proven. Not Investment Committee approval or BUY. Repeated calls can return revised vendor fundamentals. No decisions or portfolio writes.",
    decisionsWritten: false, transactionsWritten: false,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
