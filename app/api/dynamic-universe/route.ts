import { NextResponse } from "next/server";
import { getDynamicDiscoveryUniverse } from "@/lib/discovery/dynamic-universe";

export async function GET() {
  try {
    const stocks =
      await getDynamicDiscoveryUniverse();

    const bucketCounts =
      stocks.reduce<
        Record<string, number>
      >(
        (counts, stock) => {
          counts[
            stock.marketCapBucket
          ] =
            (
              counts[
                stock.marketCapBucket
              ] ?? 0
            ) + 1;

          return counts;
        },
        {}
      );

    const exchangeCounts =
      stocks.reduce<
        Record<string, number>
      >(
        (counts, stock) => {
          const exchange =
            stock.exchangeShortName ??
            "Unknown";

          counts[exchange] =
            (
              counts[
                exchange
              ] ?? 0
            ) + 1;

          return counts;
        },
        {}
      );

    const sectorCounts =
      stocks.reduce<
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
      count:
        stocks.length,

      bucketCounts,

      exchangeCounts,

      sectorCounts,

      sampleSmallCaps:
        stocks
          .filter(
            (stock) =>
              stock.marketCapBucket ===
              "small"
          )
          .slice(
            0,
            10
          ),

      sampleMidCaps:
        stocks
          .filter(
            (stock) =>
              stock.marketCapBucket ===
              "mid"
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
            : "Unable to build dynamic universe.",
      },
      {
        status: 500,
      }
    );
  }
}