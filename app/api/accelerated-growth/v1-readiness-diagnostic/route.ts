import { NextResponse } from "next/server";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";
import { getAgDailyCycleStatus } from "@/lib/discovery/accelerated-growth/daily-cycle-status";
import { executeAgDailyCycleTransactions } from "@/lib/discovery/accelerated-growth/daily-cycle-execution";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG V1 readiness diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const [state, cycleStatus] = await Promise.all([
      getAgOperationalState(),
      getAgDailyCycleStatus(),
    ]);

    const executionGate = await executeAgDailyCycleTransactions({
      enabled: false,
      buyDecisions: [{ decisionId: "readiness-buy-never-execute", symbol: "ZZREADYBUY", decision: "BUY" }],
      holdingDecisions: [{ decisionId: "readiness-sell-never-execute", symbol: "ZZREADYSELL", decision: "SELL", reused: false }],
    });

    const finite = (value: number) => Number.isFinite(value);
    const holdingsValued = state.holdings.every((holding) =>
      finite(holding.quantity) && holding.quantity > 0 &&
      finite(holding.price) && holding.price > 0 &&
      finite(holding.marketValue) && holding.marketValue >= 0
    );

    const checks = {
      portfolioResolved: Boolean(state.portfolioId),
      strategyEraResolved: Boolean(state.eraId),
      referenceCapitalFinite: finite(state.accounting.referenceTotalCapital),
      sleeveCapFinite: finite(state.accounting.sleeveCap),
      sleeveCashFinite: finite(state.accounting.sleeveCash),
      currentEquityFinite: finite(state.valuation.currentEquity),
      drawdownFinite: finite(state.valuation.drawdownPct),
      holdingsValued,
      dailyCycleReadable: Boolean(cycleStatus.cycleDate) && typeof cycleStatus.status === "string",
      executionLocked: executionGate.enabled === false,
      buyRecognizedButNotExecuted: executionGate.buyDecisionCount === 1 && executionGate.executedBuyCount === 0,
      sellRecognizedButNotExecuted: executionGate.sellDecisionCount === 1 && executionGate.executedSellCount === 0,
      noTransactionsWritten: executionGate.buys.length === 0 && executionGate.sells.length === 0,
    };

    return NextResponse.json({
      agV1ReadinessDiagnostic: true,
      zeroAI: true,
      zeroWrite: true,
      zeroExecution: true,
      portfolioId: state.portfolioId,
      eraId: state.eraId,
      cycleDate: cycleStatus.cycleDate,
      cycleStatus: cycleStatus.status,
      holdingCount: state.holdings.length,
      activeDecisionCount: state.activeDecisions.length,
      researchWatchCount: state.researchWatchlist.length,
      executionGate,
      checks,
      passed: Object.values(checks).every(Boolean),
    });
  } catch (error) {
    return NextResponse.json({
      agV1ReadinessDiagnostic: true,
      zeroAI: true,
      zeroWrite: true,
      zeroExecution: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG V1 readiness diagnostic failed.",
    }, { status: 500 });
  }
}
