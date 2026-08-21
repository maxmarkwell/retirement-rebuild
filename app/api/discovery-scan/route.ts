import {
  NextRequest,
  NextResponse,
} from "next/server";
import { runDiscoveryScan } from "@/lib/discovery/scanner";
import type { DiscoveryPortfolioMode } from "@/lib/discovery/types";

export async function GET(
  request: NextRequest
) {
  const mode =
    request.nextUrl.searchParams.get(
      "mode"
    ) as DiscoveryPortfolioMode | null;

  if (
    mode !== "paper_active" &&
    mode !== "paper_long_term"
  ) {
    return NextResponse.json(
      {
        error:
          "mode must be paper_active or paper_long_term.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const result =
      await runDiscoveryScan(
        mode
      );

    return NextResponse.json({
      portfolioMode:
        result.portfolioMode,

      universeCount:
        result.universeCount,

      scoredCount:
        result.scoredCount,

      unavailableCount:
        result.unavailableCount,

      openAiCalls:
        result.openAiCalls,

      topCandidates:
        result.candidates.slice(
          0,
          10
        ),

      failures:
        result.failures,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to run discovery scan.";

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status: 500,
      }
    );
  }
}