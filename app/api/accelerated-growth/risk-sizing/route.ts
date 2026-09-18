import { NextResponse } from "next/server";
import { sizeAgBuy } from "@/lib/discovery/accelerated-growth/risk-sizing";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Accelerated Growth sizing diagnostic is disabled in production." }, { status: 404 });
  }

  const base = {
    referenceTotalCapital: 200,
    availableCash: 153.83,
    currentAgMarketValue: 0,
    currentPositionMarketValue: 0,
    currentThemeMarketValue: 0,
    price: 100,
    committeeDecision: "BUY" as const,
    liquidityEligible: true,
    thesisValid: true,
  };

  return NextResponse.json({
    version: "ag-risk-v1",
    cases: {
      starter: sizeAgBuy(base),
      committeeWatchBlocked: sizeAgBuy({ ...base, committeeDecision: "WATCH" }),
      liquidityBlocked: sizeAgBuy({ ...base, liquidityEligible: false }),
      sleeveFullBlocked: sizeAgBuy({ ...base, currentAgMarketValue: 40 }),
      themeFullBlocked: sizeAgBuy({ ...base, currentThemeMarketValue: 20 }),
      addWithoutReassessmentBlocked: sizeAgBuy({
        ...base,
        currentAgMarketValue: 5,
        currentPositionMarketValue: 5,
        currentThemeMarketValue: 5,
        isExistingPosition: true,
        allowAdd: false,
      }),
      reassessedAdd: sizeAgBuy({
        ...base,
        currentAgMarketValue: 5,
        currentPositionMarketValue: 5,
        currentThemeMarketValue: 5,
        isExistingPosition: true,
        allowAdd: true,
      }),
    },
  });
}
