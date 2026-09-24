import { NextResponse } from "next/server";
import { evaluateAgPortfolioGuardrails } from "@/lib/discovery/accelerated-growth/portfolio-guardrails";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const base = {
    referenceTotalCapital: 200,
    currentAgMarketValue: 20,
    currentThemeMarketValue: 5,
    currentPositionMarketValue: 5,
    availableCash: 100,
    sleeveDrawdownPct: 0,
    thesisValid: true,
    liquidityEligible: true,
  };

  const cases = {
    normal: evaluateAgPortfolioGuardrails(base),
    drawdown1499: evaluateAgPortfolioGuardrails({ ...base, sleeveDrawdownPct: 14.99 }),
    drawdown1500: evaluateAgPortfolioGuardrails({ ...base, sleeveDrawdownPct: 15 }),
    drawdownAbove: evaluateAgPortfolioGuardrails({ ...base, sleeveDrawdownPct: 20 }),
    sleeveFull: evaluateAgPortfolioGuardrails({ ...base, currentAgMarketValue: 40 }),
    themeFull: evaluateAgPortfolioGuardrails({ ...base, currentThemeMarketValue: 20 }),
    positionFull: evaluateAgPortfolioGuardrails({ ...base, currentPositionMarketValue: 10 }),
    insufficientCash: evaluateAgPortfolioGuardrails({ ...base, availableCash: 4.99 }),
    thesisInvalid: evaluateAgPortfolioGuardrails({ ...base, thesisValid: false }),
    liquidityFailed: evaluateAgPortfolioGuardrails({ ...base, liquidityEligible: false }),
    addWithoutReassessment: evaluateAgPortfolioGuardrails({ ...base, reassessmentComplete: false }),
    addWithReassessment: evaluateAgPortfolioGuardrails({ ...base, reassessmentComplete: true }),
  };

  return NextResponse.json({
    version: "ag-guardrails-diagnostic-v1",
    cases,
  });
}
