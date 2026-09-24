import { NextRequest, NextResponse } from "next/server";
import { runAgResearchDailyCycle } from "@/lib/discovery/accelerated-growth/daily-cycle-work";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";

    // V1 production entry point intentionally cannot execute transactions.
    // Enabling paper execution will be a separate server-side change after the
    // full research/persistence cycle is proven in normal operation.
    const cycle = await runAgResearchDailyCycle({
      maxCandidates,
      retryFailed,
      executeTransactions: false,
    });

    if (!cycle.executed) {
      return NextResponse.json({
        cycleId: cycle.cycleId,
        cycleDate: cycle.cycleDate,
        cycleStatus: cycle.status,
        reusedDailyCycle: true,
        retryAvailable: cycle.status === "failed",
        executionEnabled: false,
        transactionsWritten: false,
      });
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
      retryAvailable: retryableCycleFailure,
      executionEnabled: false,
      transactionsWritten: false,
    }, { status: retryableCycleFailure ? 409 : 500 });
  }
}
