import { NextResponse } from "next/server";

const FMP_BASE_URL =
  "https://financialmodelingprep.com/stable";

async function testEndpoint(
  name: string,
  path: string
) {
  const apiKey =
    process.env.FMP_API_KEY;

  if (!apiKey) {
    return {
      name,
      success: false,
      status: null,
      error: "FMP_API_KEY is not configured.",
    };
  }

  try {
    const separator =
      path.includes("?") ? "&" : "?";

    const response =
      await fetch(
        `${FMP_BASE_URL}/${path}${separator}apikey=${apiKey}`,
        {
          cache: "no-store",
        }
      );

    const text =
      await response.text();

    let data: unknown;

    try {
      data =
        JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      name,
      success:
        response.ok,
      status:
        response.status,
      data,
    };
  } catch (error) {
    return {
      name,
      success: false,
      status: null,
      error:
        error instanceof Error
          ? error.message
          : "Unknown FMP error.",
    };
  }
}

export async function GET() {
  const symbol = "MSFT";

  const tests =
    await Promise.all([
      testEndpoint(
        "ratios-ttm",
        `ratios-ttm?symbol=${symbol}`
      ),

      testEndpoint(
        "key-metrics-ttm",
        `key-metrics-ttm?symbol=${symbol}`
      ),

      testEndpoint(
        "ratios-annual",
        `ratios?symbol=${symbol}&period=annual&limit=5`
      ),

      testEndpoint(
        "key-metrics-annual",
        `key-metrics?symbol=${symbol}&period=annual&limit=5`
      ),

      testEndpoint(
        "income-statement",
        `income-statement?symbol=${symbol}&period=annual&limit=5`
      ),

      testEndpoint(
        "balance-sheet",
        `balance-sheet-statement?symbol=${symbol}&period=annual&limit=5`
      ),

      testEndpoint(
        "cash-flow",
        `cash-flow-statement?symbol=${symbol}&period=annual&limit=5`
      ),

      testEndpoint(
  "stock-list",
  "stock-list"
),

testEndpoint(
  "company-screener",
  "company-screener?country=US&isEtf=false&isFund=false&isActivelyTrading=true&limit=25"
),

testEndpoint(
  "exchange-symbol-list",
  "symbol-list?exchange=NASDAQ"
),

testEndpoint(
  "screener-small-marketcap-lower",
  "company-screener?country=US&isEtf=false&isFund=false&isActivelyTrading=true&marketCapMoreThan=300000000&marketCapLowerThan=2000000000&limit=10"
),

testEndpoint(
  "screener-small-marketcap-less",
  "company-screener?country=US&isEtf=false&isFund=false&isActivelyTrading=true&marketCapMoreThan=300000000&marketCapLessThan=2000000000&limit=10"
),
    ]);

  return NextResponse.json({
    symbol,
    testCount:
      tests.length,

    successful:
      tests.filter(
        (test) =>
          test.success
      ).length,

    failed:
      tests.filter(
        (test) =>
          !test.success
      ).length,

    tests,
  });
}