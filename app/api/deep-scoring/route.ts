import {
  NextResponse,
} from "next/server";

import {
  runDeepResearch,
} from "@/lib/discovery/deep-research";

import {
  scoreDeepDiscoveryCandidate,
} from "@/lib/discovery/deep-scoring";

export async function GET() {
  try {
    const research =
      await runDeepResearch();

    const scored =
      research.candidates
        .filter(
          (
            candidate
          ): candidate is typeof candidate & {
            fundamentals: NonNullable<
              typeof candidate.fundamentals
            >;
            trends: NonNullable<
              typeof candidate.trends
            >;
          } =>
            candidate.error ==
              null &&
            candidate.fundamentals !=
              null &&
            candidate.trends !=
              null
        )
        .map(
          (candidate) => ({
            ticker:
              candidate.ticker,

            companyName:
              candidate.companyName,

            sector:
              candidate.sector,

            industry:
              candidate.industry,

            marketCapBucket:
              candidate.marketCapBucket,

            selectorScore:
              candidate.selectorScore,

            deepScore:
              scoreDeepDiscoveryCandidate(
                candidate.fundamentals,
                candidate.trends
              ),

            marketCap:
              candidate
                .fundamentals
                .marketCap,

            revenueGrowth:
              candidate
                .fundamentals
                .revenueGrowth,

            roic:
              candidate
                .fundamentals
                .returnOnInvestedCapital,

            fcfYield:
              candidate
                .fundamentals
                .freeCashFlowYield,

            shareCountChangePct:
              candidate
                .trends
                .shareCount
                .percentChange,
          })
        )
        .sort(
          (a, b) =>
            b.deepScore
              .totalScore -
            a.deepScore
              .totalScore
        );

    return NextResponse.json({
      inputCount:
        research.inputCount,

      scoredCount:
        scored.length,

      topCandidates:
        scored.slice(
          0,
          25
        ),

      nutx:
        scored.find(
          (candidate) =>
            candidate.ticker ===
            "NUTX"
        ) ?? null,

      nvda:
        scored.find(
          (candidate) =>
            candidate.ticker ===
            "NVDA"
        ) ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to score deep discovery candidates.",
      },
      {
        status: 500,
      }
    );
  }
}