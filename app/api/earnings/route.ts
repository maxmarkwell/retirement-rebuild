import {
  NextRequest,
  NextResponse,
} from "next/server";
import { getCompanyEarningsContext } from "@/lib/company-data/earnings";

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
    const earnings =
      await getCompanyEarningsContext(
        symbol
      );

    return NextResponse.json(
      earnings
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to retrieve earnings context.";

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