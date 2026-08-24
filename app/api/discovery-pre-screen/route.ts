import { NextResponse } from "next/server";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";
import { preScreenDynamicUniverse } from "@/lib/discovery/pre-screen";

export async function GET() {
  try {
    const universe =
      await getDynamicDiscoveryUniverse();

    const result =
      preScreenDynamicUniverse(
        universe
      );

    const sectorCounts =
      result.selected.reduce<
        Record<string, number>
      >(
        (counts, stock) => {
          const sector =
            stock.sector ??
            "Unknown";

          counts[sector] =
            (
              counts[
                sector
              ] ?? 0
            ) + 1;

          return counts;
        },
        {}
      );

    return NextResponse.json({
      inputCount:
        result.inputCount,

      selectedCount:
        result.selectedCount,

      bucketCounts:
        result.bucketCounts,

      sectorCounts,

      sampleSmallCaps:
        result.selected
          .filter(
            (stock) =>
              stock.marketCapBucket ===
              "small"
          )
          .slice(0, 15),

      sampleMidCaps:
        result.selected
          .filter(
            (stock) =>
              stock.marketCapBucket ===
              "mid"
          )
          .slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run discovery pre-screen.",
      },
      {
        status: 500,
      }
    );
  }
}