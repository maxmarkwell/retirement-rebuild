import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getCompanyFundamentalTrends } from "@/lib/company-data/trends";

export async function GET(
  request: NextRequest
) {
  const symbol =
    request.nextUrl.searchParams
      .get("symbol")
      ?.trim()
      .toUpperCase();

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

  try {
    const trends =
      await getCompanyFundamentalTrends(
        symbol
      );

    return NextResponse.json(
      trends
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load fundamental trends.";

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