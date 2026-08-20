import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getCompanyFundamentals } from "@/lib/company-data/fmp";

export async function GET(
  request: NextRequest
) {
  const symbol =
    request.nextUrl.searchParams.get(
      "symbol"
    );

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
    const fundamentals =
      await getCompanyFundamentals(
        symbol
      );

    return NextResponse.json(
      fundamentals
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to retrieve company fundamentals.";

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