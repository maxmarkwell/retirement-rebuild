import {
  NextResponse,
} from "next/server";

import {
  runDiscoveryV2,
} from "@/lib/discovery/discovery-v2";

export async function GET() {
  try {
    /*
      No portfolio context is supplied yet.

      Discovery V2 therefore uses the neutral
      portfolio-fit score of 50.

      The production persistence layer will
      supply the real portfolio context once
      we connect V2 to the existing Discovery
      workflow.
    */

    const result =
      await runDiscoveryV2();

    const bucketCounts =
      result.candidates.reduce<
        Record<string, number>
      >(
        (counts, candidate) => {
          const bucket =
            candidate.marketCapBucket;

          counts[bucket] =
            (
              counts[bucket] ??
              0
            ) + 1;

          return counts;
        },
        {}
      );

    const sectorCounts =
      result.candidates.reduce<
        Record<string, number>
      >(
        (counts, candidate) => {
          const sector =
            candidate.sector ??
            "Unknown";

          counts[sector] =
            (
              counts[sector] ??
              0
            ) + 1;

          return counts;
        },
        {}
      );

    return NextResponse.json({
      researchedCount:
        result.researchedCount,

      scoredCount:
        result.scoredCount,

      portfolioAware:
        false,

      portfolioFitMode:
        "neutral",

      neutralPortfolioFitScore:
        50,

      bucketCounts,

      sectorCounts,

      topOverall:
        result.candidates.slice(
          0,
          25
        ),

      topSmall:
        result.candidates
          .filter(
            (candidate) =>
              candidate.marketCapBucket ===
              "small"
          )
          .slice(
            0,
            10
          ),

      topMid:
        result.candidates
          .filter(
            (candidate) =>
              candidate.marketCapBucket ===
              "mid"
          )
          .slice(
            0,
            10
          ),

      topLarge:
        result.candidates
          .filter(
            (candidate) =>
              candidate.marketCapBucket ===
              "large"
          )
          .slice(
            0,
            10
          ),

      topMega:
        result.candidates
          .filter(
            (candidate) =>
              candidate.marketCapBucket ===
              "mega"
          )
          .slice(
            0,
            10
          ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run Discovery V2.",
      },
      {
        status: 500,
      }
    );
  }
}