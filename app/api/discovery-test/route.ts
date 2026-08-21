import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getCompanyFundamentals } from "@/lib/company-data/fmp";
import { getCompanyEarningsContext } from "@/lib/company-data/earnings";
import { scoreDiscoveryCandidate } from "@/lib/discovery/scoring";
import type { DiscoveryPortfolioMode } from "@/lib/discovery/types";

export async function GET(
  request: NextRequest
) {
  const symbol =
    request.nextUrl.searchParams.get("symbol");

  const mode =
    request.nextUrl.searchParams.get(
      "mode"
    ) as DiscoveryPortfolioMode | null;

  if (!symbol) {
    return NextResponse.json(
      {
        error:
          "A symbol query parameter is required.",
      },
      {
        status: 400,
      }
    );
  }

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
    const [fundamentals, earnings] =
      await Promise.all([
        getCompanyFundamentals(symbol),
        getCompanyEarningsContext(symbol),
      ]);

    const candidate =
      scoreDiscoveryCandidate({
        ticker: symbol,
        portfolioMode: mode,
        fundamentals,
        earnings,
        portfolioFitScore: 50,
      });

    return NextResponse.json({
      candidate,
      fundamentals: {
        revenueGrowth:
          fundamentals.revenueGrowth,
        operatingMargin:
          fundamentals.operatingMargin,
        freeCashFlowYield:
          fundamentals.freeCashFlowYield,
        evToFreeCashFlow:
          fundamentals.evToFreeCashFlow,
        evToEbitda:
          fundamentals.evToEbitda,
        netDebtToEbitda:
          fundamentals.netDebtToEbitda,
      },
      earnings: {
        latest:
          earnings.latestReported,
        previous:
          earnings.previousReported,
        next:
          earnings.nextExpected,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to score discovery candidate.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}