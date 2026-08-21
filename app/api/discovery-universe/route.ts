import { NextResponse } from "next/server";
import { DISCOVERY_UNIVERSE } from "@/lib/discovery/universe";

export async function GET() {
  const sectorCounts =
    DISCOVERY_UNIVERSE.reduce<
      Record<string, number>
    >((counts, stock) => {
      counts[stock.sector] =
        (counts[stock.sector] ?? 0) + 1;

      return counts;
    }, {});

  return NextResponse.json({
    count: DISCOVERY_UNIVERSE.length,
    sectorCounts,
    stocks: DISCOVERY_UNIVERSE,
  });
}