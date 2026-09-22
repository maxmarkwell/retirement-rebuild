import { NextResponse } from "next/server";
import { evaluateAgPortfolioGuardrails } from "@/lib/discovery/accelerated-growth/portfolio-guardrails";
import { sizeAgBuy } from "@/lib/discovery/accelerated-growth/risk-sizing";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG theme diagnostic is disabled in production." }, { status: 404 });
  }

  const base = {
    referenceTotalCapital: 200,
    currentAgMarketValue: 15,
    currentPositionMarketValue: 0,
    availableCash: 185,
    sleeveDrawdownPct: 0,
    thesisValid: true,
    liquidityEligible: true,
    reassessmentComplete: false,
  };

  const differentSectorGuardrails = evaluateAgPortfolioGuardrails({
    ...base,
    currentThemeMarketValue: 0,
  });
  const differentSectorSizing = sizeAgBuy({
    referenceTotalCapital: 200,
    availableCash: 185,
    currentAgMarketValue: 15,
    currentPositionMarketValue: 0,
    currentThemeMarketValue: 0,
    price: 100,
    committeeDecision: "BUY",
    liquidityEligible: true,
    thesisValid: true,
    isExistingPosition: false,
  });

  const sameSectorAtCapGuardrails = evaluateAgPortfolioGuardrails({
    ...base,
    currentThemeMarketValue: 20,
  });
  const sameSectorAtCapSizing = sizeAgBuy({
    referenceTotalCapital: 200,
    availableCash: 185,
    currentAgMarketValue: 15,
    currentPositionMarketValue: 0,
    currentThemeMarketValue: 20,
    price: 100,
    committeeDecision: "BUY",
    liquidityEligible: true,
    thesisValid: true,
    isExistingPosition: false,
  });

  const passed =
    differentSectorGuardrails.buyAllowed === true &&
    differentSectorSizing.eligible === true &&
    differentSectorSizing.targetNotional === 5 &&
    sameSectorAtCapGuardrails.buyAllowed === false &&
    sameSectorAtCapSizing.eligible === false;

  return NextResponse.json({
    themeAccountingDiagnostic: true,
    zeroWrite: true,
    differentSector: {
      currentAgMarketValue: 15,
      currentThemeMarketValue: 0,
      buyAllowed: differentSectorGuardrails.buyAllowed,
      sizingEligible: differentSectorSizing.eligible,
      targetNotional: differentSectorSizing.targetNotional,
      reasons: [...differentSectorGuardrails.reasons, ...differentSectorSizing.reasons],
    },
    sameSectorAtCap: {
      currentAgMarketValue: 15,
      currentThemeMarketValue: 20,
      buyAllowed: sameSectorAtCapGuardrails.buyAllowed,
      sizingEligible: sameSectorAtCapSizing.eligible,
      targetNotional: sameSectorAtCapSizing.targetNotional,
      reasons: [...sameSectorAtCapGuardrails.reasons, ...sameSectorAtCapSizing.reasons],
    },
    passed,
  });
}
