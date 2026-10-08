import { NextRequest, NextResponse } from "next/server";
import { runAgResearchDailyCycle } from "@/lib/discovery/accelerated-growth/daily-cycle-work";
import { runNextAgResumableCycleStep } from "@/lib/discovery/accelerated-growth/resumable-cycle-orchestrator";
import { runNextAgDurabilityStep } from "@/lib/discovery/accelerated-growth/resumable-durability-orchestrator";
import { startAgAutonomousResearchContinuation } from "@/lib/discovery/accelerated-growth/autonomous-cycle-start";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Fail closed until the timed-out research pipeline is made recoverable.
  // Only a deliberate server-side configuration change can re-enable runs.
  if (process.env.AG_DAILY_CYCLE_RUNS_ENABLED !== "true") {
    return NextResponse.json({
      reason: "Accelerated Growth research is paused pending timeout remediation.",
      researchPaused: true,
      retryAvailable: false,
      executionEnabled: false,
      transactionsWritten: false,
    }, { status: 503 });
  }
  // A six-stage autonomous cycle cannot safely start unless its durability
  // consumer is enabled. Reject before creating or advancing any cycle.
  if (process.env.AG_RESUMABLE_RESEARCH_RUNNER_ENABLED === "true" &&
      process.env.AG_RESUMABLE_DURABILITY_ENABLED !== "true" &&
      !(process.env.AG_AUTONOMOUS_CYCLE_ENABLED === "true" &&
        process.env.AG_AUTONOMOUS_QUEUE_ENABLED === "true" &&
        process.env.AG_AUTONOMOUS_WORKER_ENABLED === "true" &&
        process.env.AG_AUTONOMOUS_DURABILITY_ENABLED === "true")) {
    return NextResponse.json({
      reason: "AG research durability is disabled; refusing to start a cycle that cannot finalize.",
      researchPaused: true,
      retryAvailable: false,
      executionEnabled: false,
      transactionsWritten: false,
    }, { status: 503 });
  }
  try {
    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;

    // Recovery runner is a separate, OFF-by-default authority. It advances at
    // most one durable research unit and cannot persist decisions or transact.
    if (process.env.AG_RESUMABLE_RESEARCH_RUNNER_ENABLED === "true") {
      const step = await runNextAgResumableCycleStep({ maxCandidates });
      if ((step.persistenceReady || step.action === "research_complete") && process.env.AG_RESUMABLE_DURABILITY_ENABLED === "true") {
        const durable = await runNextAgDurabilityStep({ cycleId: step.cycleId });
        return NextResponse.json({ ...durable, resumableResearch: true, durabilityEnabled: true, executionEnabled: false, transactionsWritten: false });
      }
      const autonomous = step.action === "stage_step" || step.action === "wait"
        ? await startAgAutonomousResearchContinuation(step.cycleId)
        : { started: false as const };
      return NextResponse.json({
        ...step,
        autonomousResearch: autonomous.started,
        resumableResearch: true,
        executionEnabled: false,
        transactionsWritten: false,
      }, { status: step.action === "manual_review" ? 409 : 200 });
    }

    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";

    // V1 production entry point intentionally cannot execute transactions.
    // Enabling paper execution will be a separate server-side change after the
    // full research/persistence cycle is proven in normal operation.
    const cycle = await runAgResearchDailyCycle({
      maxCandidates,
      retryFailed,
      executeTransactions: false,
    });

    if (!cycle.executed && cycle.staleRunningCycle) {
      return NextResponse.json({
        reason: "A potentially abandoned AG cycle requires manual review before another run.",
        cycleId: cycle.cycleId,
        cycleDate: cycle.cycleDate,
        cycleStatus: cycle.status,
        staleRunningCycle: true,
        requiresManualRecoveryReview: true,
        retryAvailable: false,
        executionEnabled: false,
        transactionsWritten: false,
      }, { status: 409 });
    }

    if (!cycle.executed) {
      return NextResponse.json({
        cycleId: cycle.cycleId,
        cycleDate: cycle.cycleDate,
        cycleStatus: cycle.status,
        reusedDailyCycle: true,
        retryAvailable: cycle.status === "failed",
        staleRunningCycle: cycle.staleRunningCycle,
        requiresManualRecoveryReview: cycle.staleRunningCycle,
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
