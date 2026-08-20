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
      preview: text.slice(0, 800),
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
        "ratios",
        `${base}/ratios?symbol=${ticker}&period=annual&limit=1&apikey=${apiKey}`
      ),

      testEndpoint(
        "ratios-ttm",
        `${base}/ratios-ttm?symbol=${ticker}&apikey=${apiKey}`
      ),

      testEndpoint(
        "key-metrics",
        `${base}/key-metrics?symbol=${ticker}&period=annual&limit=1&apikey=${apiKey}`
      ),

      testEndpoint(
        "key-metrics-ttm",
        `${base}/key-metrics-ttm?symbol=${ticker}&apikey=${apiKey}`
      ),

      testEndpoint(
        "enterprise-values",
        `${base}/enterprise-values?symbol=${ticker}&period=annual&limit=1&apikey=${apiKey}`
      ),
    ]);

  return NextResponse.json({
    symbol: ticker,
    results,
  });
}