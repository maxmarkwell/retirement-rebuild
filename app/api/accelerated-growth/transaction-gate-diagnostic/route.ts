import { NextResponse } from "next/server";
import { executeAgDailyCycleTransactions } from "@/lib/discovery/accelerated-growth/daily-cycle-execution";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG transaction gate diagnostic is disabled in production." }, { status: 404 });
  }

  const disabled = await executeAgDailyCycleTransactions({
    enabled: false,
    buyDecisions: [
      { id: "diagnostic-active-buy", ticker: "ZZBUY", decision_type: "buy", status: "active" },
      { id: "diagnostic-watch", ticker: "ZZWATCH", decision_type: "watch", status: "active" },
      { id: "diagnostic-inactive-buy", ticker: "ZZOLD", decision_type: "buy", status: "superseded" },
    ],
    holdingDecisions: [
      { decisionId: "diagnostic-sell", symbol: "ZZSELL", decision: "SELL", reused: false },
      { decisionId: "diagnostic-hold", symbol: "ZZHOLD", decision: "HOLD", reused: false },
    ],
  });

  const checks = {
    onlyActiveBuyRecognized: disabled.buyDecisionCount === 1,
    onlySellRecognized: disabled.sellDecisionCount === 1,
    noBuyExecuted: disabled.executedBuyCount === 0 && disabled.buys.length === 0,
    noSellExecuted: disabled.executedSellCount === 0 && disabled.sells.length === 0,
    gateStayedDisabled: disabled.enabled === false,
  };

  return NextResponse.json({
    agTransactionGateDiagnostic: true,
    zeroAI: true,
    zeroWrite: true,
    zeroExecution: true,
    execution: disabled,
    checks,
    passed: Object.values(checks).every(Boolean),
  });
}
