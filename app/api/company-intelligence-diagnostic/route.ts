import {
  NextRequest,
  NextResponse,
} from "next/server";

async function testEndpoint(
  label: string,
  url: string
) {
  try {
    const response = await fetch(url, {
      cache: "no-store",
    });

    const text = await response.text();

    return {
      label,
      status: response.status,
      ok: response.ok,
      preview: text.slice(0, 1200),
    };
  } catch (error) {
    return {
      label,
      status: null,
      ok: false,
      preview:
        error instanceof Error
          ? error.message
          : "Unknown error",
    };
  }
}

export async function GET(
  request: NextRequest
) {
  const symbol =
    request.nextUrl.searchParams.get(
      "symbol"
    );

  const apiKey =
    process.env.FMP_API_KEY;

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

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "FMP_API_KEY is not configured.",
      },
      {
        status: 500,
      }
    );
  }

  const ticker =
    symbol.trim().toUpperCase();

  const base =
    "https://financialmodelingprep.com/stable";

  const results =
    await Promise.all([
      testEndpoint(
        "earnings",
        `${base}/earnings?symbol=${ticker}&apikey=${apiKey}`
      ),

      testEndpoint(
        "transcript-dates",
        `${base}/earning-call-transcript-dates?symbol=${ticker}&apikey=${apiKey}`
      ),

      testEndpoint(
        "transcript",
        `${base}/earning-call-transcript?symbol=${ticker}&year=2026&quarter=4&apikey=${apiKey}`
      ),

      testEndpoint(
        "stock-news",
        `${base}/news/stock?symbols=${ticker}&limit=5&apikey=${apiKey}`
      ),

      testEndpoint(
        "press-releases",
        `${base}/news/press-releases?symbols=${ticker}&limit=5&apikey=${apiKey}`
      ),
    ]);

  return NextResponse.json({
    symbol: ticker,
    results,
  });
}