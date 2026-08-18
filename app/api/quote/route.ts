import { NextRequest, NextResponse } from "next/server";
import { getMarketQuote } from "@/lib/market-data/twelve-data";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json(
      { error: "A symbol query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const quote = await getMarketQuote(symbol);

    return NextResponse.json(quote);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to retrieve market quote.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}