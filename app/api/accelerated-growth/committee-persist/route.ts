import { NextRequest, NextResponse } from "next/server";
import { runAgResearchDailyCycle } from "@/lib/discovery/accelerated-growth/daily-cycle-work";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG Committee persistence diagnostic is disabled in production." }, { status: 404 });
  }

  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";

    const cycle = await runAgResearchDailyCycle({ maxCandidates, retryFailed });

    if (!cycle.executed) {
      return NextResponse.json({
        persisted: cycle.status === "completed",
        reusedDailyCycle: true,
        retryAvailable: cycle.status === "failed",
        transactionsWritten: false,
        cycleId: cycle.cycleId,
        cycleDate: cycle.cycleDate,
        cycleStatus: cycle.status,
      });
    }

    return NextResponse.json({
      ...cycle.result,
      reusedDailyCycle: false,
      retriedFailedCycle: cycle.attempt === "retried",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AG Committee persistence diagnostic failed.";
    const pipelineFailure = message === "Committee pipeline did not complete cleanly; no decisions were persisted.";
    return NextResponse.json(
      {
        persisted: false,
        retryAvailable: pipelineFailure,
        transactionsWritten: false,
        reason: pipelineFailure ? message : undefined,
        error: pipelineFailure ? undefined : message,
      },
      { status: pipelineFailure ? 409 : 500 }
    );
  }
}
