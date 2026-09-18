import { NextRequest, NextResponse } from "next/server";
import { evaluateAcceleratedGrowthCandidate } from "../../../../lib/discovery/accelerated-growth/evaluate";

export const dynamic = "force-dynamic";

// Deliberately weighted toward smaller/mid-sized businesses while retaining
// larger reference companies. Size itself does not affect the score.
const DEFAULT_SYMBOLS = [
  "BLBD",
  "UPWK",
  "YELP",
  "QLYS",
  "NUTX",
  "AGX",
  "FSLR",
  "TTD",
  "APP",
  "ADBE",
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
    return NextResponse.json({ error: "Accelerated Growth diagnostic basket is disabled in production." }, { status: 404 });
  }

  const symbols = parseSymbols(request);
  if (!symbols) {
    return NextResponse.json({ error: `Provide 1-${MAX_SYMBOLS} valid comma-separated symbols.` }, { status: 400 });
  }

  const results = [];
  for (const symbol of symbols) {
    try {
      const candidate = await evaluateAcceleratedGrowthCandidate(symbol);
      results.push({
        symbol,
        companyName: candidate.companyName,
        marketCap: candidate.marketCap,
        marketCapBucket: candidate.marketCapBucket,
        status: candidate.score.status,
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
        companyName: null,
        marketCap: null,
        marketCapBucket: "unknown",
        status: "INSUFFICIENT_DATA",
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

  const statusOrder: Record<string, number> = { ADVANCE: 0, REVIEW: 1, REJECT: 2, INSUFFICIENT_DATA: 3 };
  const ranked = [...results].sort((a, b) => {
    const statusDifference = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDifference !== 0) return statusDifference;
    if (a.total == null && b.total == null) return a.symbol.localeCompare(b.symbol);
    if (a.total == null) return 1;
    if (b.total == null) return -1;
    return b.total - a.total;
  });

  return NextResponse.json({
    scoreVersion: "ag-discovery-v1",
    requested: symbols.length,
    successful: results.filter((result) => result.total != null).length,
    statusCounts: ranked.reduce<Record<string, number>>((counts, result) => {
      counts[result.status] = (counts[result.status] ?? 0) + 1;
      return counts;
    }, {}),
    results: ranked,
  });
}
