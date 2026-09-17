import { NextRequest, NextResponse } from "next/server";
import { evaluateAcceleratedGrowthCandidate } from "../../../../lib/discovery/accelerated-growth/evaluate";

export const dynamic = "force-dynamic";

const DEFAULT_SYMBOLS = [
  "ADBE",
  "APP",
  "UBER",
  "TTD",
  "FSLR",
  "BLBD",
  "UPWK",
  "YELP",
];

const MAX_SYMBOLS = 10;

function parseSymbols(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols");
  const symbols = (raw ? raw.split(",") : DEFAULT_SYMBOLS)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  const unique = [...new Set(symbols)];
  if (unique.length === 0 || unique.length > MAX_SYMBOLS) return null;
  if (unique.some((symbol) => !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol))) return null;
  return unique;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Accelerated Growth diagnostic basket is disabled in production." },
      { status: 404 }
    );
  }

  const symbols = parseSymbols(request);
  if (!symbols) {
    return NextResponse.json(
      { error: `Provide 1-${MAX_SYMBOLS} valid comma-separated symbols.` },
      { status: 400 }
    );
  }

  // Run sequentially on purpose. This diagnostic is validating the model, not
  // stress-testing FMP, and avoids an unnecessary burst of provider requests.
  const results = [];
  for (const symbol of symbols) {
    try {
      const candidate = await evaluateAcceleratedGrowthCandidate(symbol);
      results.push({
        symbol,
        total: candidate.score.total,
        classification: candidate.acceleration.accelerationDirection,
        eligible: candidate.acceleration.dataQuality.eligibleForScoring,
        fundamentalAcceleration: candidate.score.components.fundamentalAcceleration,
        earningsConfirmation: candidate.score.components.earningsConfirmation,
        businessQuality: candidate.score.components.businessQuality,
        valuationReward: candidate.score.components.valuationReward,
        revenueGrowthLatest: candidate.acceleration.revenueTrajectory.latest,
        revenueGrowthSlope: candidate.acceleration.revenueTrajectory.slope,
        revenueConsistency: candidate.acceleration.revenueTrajectory.consistency,
        operatingMarginSlope: candidate.acceleration.operatingMarginTrajectory.slope,
        freeCashFlowMarginSlope: candidate.acceleration.freeCashFlowMarginTrajectory.slope,
        error: null,
      });
    } catch (error) {
      results.push({
        symbol,
        total: null,
        classification: null,
        eligible: false,
        fundamentalAcceleration: null,
        earningsConfirmation: null,
        businessQuality: null,
        valuationReward: null,
        revenueGrowthLatest: null,
        revenueGrowthSlope: null,
        revenueConsistency: null,
        operatingMarginSlope: null,
        freeCashFlowMarginSlope: null,
        error: error instanceof Error ? error.message : "Evaluation failed.",
      });
    }
  }

  const ranked = [...results].sort((a, b) => {
    if (a.total == null && b.total == null) return a.symbol.localeCompare(b.symbol);
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return b.total - a.total;
  });

  return NextResponse.json({
    scoreVersion: "ag-discovery-v1",
    requested: symbols.length,
    successful: results.filter((result) => result.total != null).length,
    results: ranked,
  });
}
