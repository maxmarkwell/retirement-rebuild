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
    const [state, cycle] = await Promise.all([getAgOperationalState(), getAgDailyCycleStatus()]);
    const gate = await executeAgDailyCycleTransactions({ enabled: false, buyDecisions: [], holdingDecisions: [] });

    const checks = {
      portfolioResolved: Boolean(state.portfolioId),
      strategyEraResolved: Boolean(state.eraId),
      accountingFinite: [state.accounting.referenceTotalCapital, state.accounting.sleeveCap, state.accounting.sleeveCash].every(Number.isFinite),
      valuationFinite: [state.valuation.currentEquity, state.valuation.highWaterMark, state.valuation.drawdownPct].every(Number.isFinite),
      valuationComplete: state.valuation.missingSymbols.length === 0,
      dailyCycleStatusReadable: Boolean(cycle.cycleDate) && typeof cycle.status === "string",
      transactionGateLocked: gate.enabled === false && gate.executedBuyCount === 0 && gate.executedSellCount === 0,
      productionCycleReportsExecutionDisabled: cycle.executionEnabled === false && cycle.transactionsWrittenByCycle === false,
    };

    return NextResponse.json({
      agV1ReadinessDiagnostic: true,
      zeroAI: true,
      zeroWrite: true,
      zeroExecution: true,
      portfolioId: state.portfolioId,
      eraId: state.eraId,
      cycleDate: cycle.cycleDate,
      cycleStatus: cycle.status,
      holdingCount: state.holdings.length,
      activeDecisionCount: state.activeDecisions.length,
      watchlistCount: state.researchWatchlist.length,
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
