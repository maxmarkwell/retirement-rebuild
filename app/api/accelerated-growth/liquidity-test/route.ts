import { NextResponse } from "next/server";
import { evaluateAgLiquidity } from "@/lib/discovery/accelerated-growth/liquidity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG liquidity diagnostic is disabled in production." }, { status: 404 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const symbols = Array.isArray(body?.symbols) && body.symbols.length > 0
      ? body.symbols.map((value: unknown) => String(value).trim().toUpperCase()).filter(Boolean).slice(0, 10)
      : ["NVDA", "ZZZZZZ"];

    const results = [];
    for (const symbol of symbols) {
      results.push({ symbol, ...(await evaluateAgLiquidity(symbol)) });
    }

    return NextResponse.json({
      liquidityDiagnostic: true,
      zeroWrite: true,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { liquidityDiagnostic: false, error: error instanceof Error ? error.message : "Unknown liquidity diagnostic error." },
      { status: 400 },
    );
  }
}
