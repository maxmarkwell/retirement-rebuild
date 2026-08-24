import { NextResponse } from "next/server";
import { runFundamentalScreen } from "@/lib/discovery/fundamental-screen";

export async function GET() {
  try {
    const result =
      await runFundamentalScreen();

    const failureCountsByBucket =
      result.failed.reduce<
        Record<
          string,
          Record<string, number>
        >
      >(
        (counts, candidate) => {
          const bucket =
            candidate.stock.marketCapBucket;

          if (!counts[bucket]) {
            counts[bucket] = {};
          }

          for (
            const reason
            of candidate.reasons
          ) {
            counts[bucket][reason] =
              (
                counts[bucket][reason] ??
                0
              ) + 1;
          }

          return counts;
        },
        {}
      );

    return NextResponse.json({
      inputCount:
        result.inputCount,

      evaluatedCount:
        result.evaluatedCount,

      passedCount:
        result.passedCount,

      failedCount:
        result.failedCount,

      bucketCounts:
        result.bucketCounts,

      failureCountsByBucket,

      samplePassedSmallCaps:
        result.passed
          .filter(
            (candidate) =>
              candidate.stock
                .marketCapBucket ===
              "small"
          )
          .slice(0, 10),

      samplePassedMidCaps:
        result.passed
          .filter(
            (candidate) =>
              candidate.stock
                .marketCapBucket ===
              "mid"
          )
          .slice(0, 10),

      sampleFailedMidCaps:
        result.failed
          .filter(
            (candidate) =>
              candidate.stock
                .marketCapBucket ===
              "mid"
          )
          .slice(0, 15),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run fundamental screen.",
      },
      {
        status: 500,
      }
    );
  }
}