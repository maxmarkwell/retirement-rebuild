import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgOperationalState } from "@/lib/discovery/accelerated-growth/operational-state";
import { getAgDailyCycleStatus } from "@/lib/discovery/accelerated-growth/daily-cycle-status";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG post-cycle diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const [state, cycleStatus] = await Promise.all([
      getAgOperationalState(),
      getAgDailyCycleStatus(),
    ]);

    const cycle = cycleStatus.cycle;
    const { data: decisions, error: decisionError } = await supabase
      .from("investment_decisions")
      .select("id, ticker, decision_type, status, confidence_score, created_at, transaction_id, ag_theme_key")
      .eq("user_id", user.id)
      .eq("portfolio_id", state.portfolioId)
      .eq("source", "ai_committee")
      .gte("created_at", state.inceptionAt)
      .order("created_at", { ascending: false });
    if (decisionError) throw new Error(`Unable to inspect AG decisions: ${decisionError.message}`);

    const activeDecisions = (decisions ?? []).filter((decision) => decision.status === "active");
    const transactionLinked = activeDecisions.filter((decision) => Boolean(decision.transaction_id));
    const checks = {
      cycleCompleted: cycleStatus.status === "completed",
      persistedCountMatchesCycle: (cycle?.persisted_decision_count ?? 0) === activeDecisions.length,
      committeeCountAtLeastPersisted: (cycle?.committee_decision_count ?? 0) >= (cycle?.persisted_decision_count ?? 0),
      noTransactionsLinked: transactionLinked.length === 0,
      sleeveStillUndeployed: state.holdings.length === 0 && state.accounting.eraNetDeployed === 0,
      executionStillLocked: cycleStatus.executionEnabled === false && cycleStatus.transactionsWrittenByCycle === false,
    };

    return NextResponse.json({
      agPostCycleDiagnostic: true,
      zeroAI: true,
      zeroWrite: true,
      zeroExecution: true,
      cycleDate: cycleStatus.cycleDate,
      cycleStatus: cycleStatus.status,
      cycleCounts: cycle ? {
        universeCount: cycle.universe_count,
        discoveryAdvanceCount: cycle.discovery_advance_count,
        deepResearchCompletedCount: cycle.deep_research_completed_count,
        deepResearchFailedCount: cycle.deep_research_failed_count,
        proceedCount: cycle.proceed_count,
        committeeDecisionCount: cycle.committee_decision_count,
        persistedDecisionCount: cycle.persisted_decision_count,
      } : null,
      activeDecisions,
      researchWatchlist: state.researchWatchlist.map((watch) => ({
        ticker: watch.ticker,
        confidence: watch.confidence,
        thesisClock: watch.thesis_clock,
      })),
      transactionLinkedDecisionCount: transactionLinked.length,
      holdingCount: state.holdings.length,
      eraNetDeployed: state.accounting.eraNetDeployed,
      checks,
      passed: Object.values(checks).every(Boolean),
    });
  } catch (error) {
    return NextResponse.json({
      agPostCycleDiagnostic: true,
      zeroAI: true,
      zeroWrite: true,
      zeroExecution: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG post-cycle diagnostic failed.",
    }, { status: 500 });
  }
}
