import { NextRequest, NextResponse } from "next/server";
import { evaluateAcceleratedGrowthCandidate } from "../../../../lib/discovery/accelerated-growth/evaluate";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Accelerated Growth diagnostic is disabled in production." },
      { status: 404 }
    );
  }

  const symbol = request.nextUrl.searchParams.get("symbol")?.trim();

  if (!symbol || !/^[A-Za-z][A-Za-z0-9.-]{0,9}$/.test(symbol)) {
    return NextResponse.json(
      { error: "Provide a valid symbol query parameter." },
      { status: 400 }
    );
  }

  try {
    const result = await evaluateAcceleratedGrowthCandidate(symbol);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Accelerated Growth diagnostic failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Accelerated Growth diagnostic failed.",
      },
      { status: 500 }
    );
  }
}
