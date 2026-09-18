import { NextResponse } from "next/server";
import { runAcceleratedGrowthDiscovery } from "../../../../lib/discovery/accelerated-growth/discovery";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth discovery diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const result = await runAcceleratedGrowthDiscovery();
    return NextResponse.json({
      version: "ag-discovery-v1",
      universeCount: result.universeCount,
      preselectedCount: result.preselectedCount,
      evaluatedCount: result.evaluatedCount,
      advanceCount: result.advanceCount,
      reviewCount: result.reviewCount,
      rejectCount: result.rejectCount,
      insufficientDataCount: result.insufficientDataCount,
      rateLimited: result.rateLimited,
      stoppedEarly: result.stoppedEarly,
      bucketSelectionCounts: result.bucketSelectionCounts,
      errors: result.errors,
      candidates: result.candidates.map((candidate) => ({
        symbol: candidate.symbol,
        companyName: candidate.companyName,
        sector: candidate.sector,
        industry: candidate.industry,
        marketCap: candidate.marketCap,
        marketCapBucket: candidate.marketCapBucket,
        selectorScore: candidate.selectorScore,
        status: candidate.score.status,
        agScore: candidate.score.total,
        fundamentalAcceleration: candidate.score.components.fundamentalAcceleration,
        earningsConfirmation: candidate.score.components.earningsConfirmation,
        businessQuality: candidate.score.components.businessQuality,
        valuationReward: candidate.score.components.valuationReward,
        latestRevenueGrowth: candidate.acceleration.revenueTrajectory.latest,
        revenueGrowthSlope: candidate.acceleration.revenueTrajectory.slope,
        revenueConsistency: candidate.acceleration.revenueTrajectory.consistency,
        operatingMarginSlope: candidate.acceleration.operatingMarginTrajectory.slope,
        freeCashFlowMarginSlope: candidate.acceleration.freeCashFlowMarginTrajectory.slope,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Accelerated Growth discovery failed." },
      { status: 500 }
    );
  }
}
