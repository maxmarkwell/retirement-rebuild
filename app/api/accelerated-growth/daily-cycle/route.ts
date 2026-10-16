import { NextRequest, NextResponse } from "next/server";
import { runAgResearchDailyCycle } from "@/lib/discovery/accelerated-growth/daily-cycle-work";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";
    const newTestRun = request.nextUrl.searchParams.get("newTestRun") === "true";

    // V1 production entry point intentionally cannot execute transactions.
    // Enabling paper execution will be a separate server-side change after the
    // full research/persistence cycle is proven in normal operation.
    const cycle = await runAgResearchDailyCycle({
      maxCandidates,
      retryFailed,
      newTestRun,
      executeTransactions: false,
    });

    if (!cycle.executed) {
      return NextResponse.json({
        cycleId: cycle.cycleId,
        reason: cycle.reason === "previous_cycle_requires_reconciliation"
          ? "An earlier Accelerated Growth cycle is unfinished. Review and reconcile it before launching new research."
          : undefined,
        cycleDate: cycle.cycleDate,
        cycleStatus: cycle.status,
        reusedDailyCycle: true,
        retryAvailable: false,
        retryBlockedReason: cycle.reason === "retry_requires_persistence_reconciliation"
          ? "AG decisions may have been partially persisted; reconcile the failed cycle before retrying."
          : undefined,
        executionEnabled: false,
        transactionsWritten: false,
      }, { status: cycle.reason === "previous_cycle_requires_reconciliation" ? 409 : 200 });
    }

    return NextResponse.json({
      ...cycle.result,
      cycleStatus: cycle.status,
      reusedDailyCycle: false,
      retriedFailedCycle: cycle.attempt === "retried",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AG daily cycle failed.";
    const retryableCycleFailure = message.includes("did not complete cleanly");
    return NextResponse.json({
      error: retryableCycleFailure ? undefined : message,
      reason: retryableCycleFailure ? message : undefined,
      retryAvailable: false,
      retryBlockedReason: "Failed AG cycles require persistence reconciliation before retry.",
      executionEnabled: false,
      transactionsWritten: false,
    }, { status: retryableCycleFailure ? 409 : 500 });
  }
}
