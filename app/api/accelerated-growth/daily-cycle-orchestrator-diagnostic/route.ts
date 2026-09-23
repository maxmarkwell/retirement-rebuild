import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgDailyCycle } from "@/lib/discovery/accelerated-growth/daily-cycle";

export const dynamic = "force-dynamic";

function diagnosticDates() {
  const seed = Math.floor(Date.now() / 1000) % 20000;
  const first = new Date(Date.UTC(1700, 0, 1 + seed));
  const second = new Date(first.getTime() + 86400000);
  return [first.toISOString().slice(0, 10), second.toISOString().slice(0, 10)] as const;
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG orchestrator diagnostic is disabled in production." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const [successDate, failureDate] = diagnosticDates();
  const cleanupIds = new Set<string>();

  try {
    const success = await runAgDailyCycle({
      cycleDate: successDate,
      maxCandidates: 1,
      work: async (context) => ({
        result: { marker: "synthetic-success", cycleId: context.cycleId },
        counts: { universeCount: 11, preselectedCount: 3, evaluatedCount: 2, discoveryAdvanceCount: 1 },
      }),
    });
    cleanupIds.add(success.cycleId);

    const blocked = await runAgDailyCycle({
      cycleDate: successDate,
      maxCandidates: 1,
      work: async () => {
        throw new Error("Completed cycle should never invoke work twice.");
      },
    });
    cleanupIds.add(blocked.cycleId);

    let failedCycleId: string | null = null;
    let syntheticFailureCaught = false;
    try {
      await runAgDailyCycle({
        cycleDate: failureDate,
        maxCandidates: 1,
        work: async (context) => {
          failedCycleId = context.cycleId;
          throw new Error("Synthetic orchestrator failure.");
        },
      });
    } catch (error) {
      syntheticFailureCaught = error instanceof Error && error.message === "Synthetic orchestrator failure.";
    }
    if (!failedCycleId) throw new Error("Failure diagnostic did not expose its cycle id.");
    cleanupIds.add(failedCycleId);

    const failedRow = await supabase.from("ag_daily_cycles")
      .select("id, status, failure_message")
      .eq("id", failedCycleId)
      .single();
    if (failedRow.error || !failedRow.data) throw new Error(`Unable to inspect failed orchestrated cycle: ${failedRow.error?.message ?? "unknown error"}`);

    const retried = await runAgDailyCycle({
      cycleDate: failureDate,
      maxCandidates: 1,
      retryFailed: true,
      work: async (context) => ({
        result: { marker: "synthetic-retry", cycleId: context.cycleId },
        counts: { universeCount: 7, committeeDecisionCount: 1, persistedDecisionCount: 1 },
      }),
    });
    cleanupIds.add(retried.cycleId);

    const rows = await supabase.from("ag_daily_cycles")
      .select("id, cycle_date, status, failure_message, universe_count, committee_decision_count, persisted_decision_count")
      .in("cycle_date", [successDate, failureDate]);
    if (rows.error) throw new Error(`Unable to verify orchestrated cycles: ${rows.error.message}`);

    const successRow = (rows.data ?? []).find((row) => row.cycle_date === successDate);
    const retryRow = (rows.data ?? []).find((row) => row.cycle_date === failureDate);
    const checks = {
      firstCycleExecuted: success.executed === true && success.status === "completed" && success.attempt === "created",
      completionCountersPersisted: successRow?.universe_count === 11,
      completedCycleBlocked: blocked.executed === false && blocked.reason === "authoritative_cycle_already_exists" && blocked.status === "completed",
      completedCycleDidNotDuplicate: (rows.data ?? []).filter((row) => row.cycle_date === successDate).length === 1,
      syntheticFailureCaught,
      failurePersisted: failedRow.data.status === "failed" && failedRow.data.failure_message === "Synthetic orchestrator failure.",
      retryExecuted: retried.executed === true && retried.status === "completed" && retried.attempt === "retried",
      retryReusedSameRow: retried.cycleId === failedCycleId,
      retryCountersPersisted: retryRow?.universe_count === 7 && retryRow?.committee_decision_count === 1 && retryRow?.persisted_decision_count === 1,
      retryClearedFailure: retryRow?.failure_message === null,
      oneAuthoritativeFailureDateRow: (rows.data ?? []).filter((row) => row.cycle_date === failureDate).length === 1,
    };
    const passed = Object.values(checks).every(Boolean);

    for (const id of cleanupIds) {
      const cleanup = await supabase.from("ag_daily_cycles").delete().eq("id", id);
      if (cleanup.error) throw new Error(`Orchestrator diagnostic passed but cleanup failed: ${cleanup.error.message}`);
    }

    return NextResponse.json({
      agDailyCycleOrchestratorDiagnostic: true,
      zeroResearch: true,
      zeroExecution: true,
      successDate,
      failureDate,
      checks,
      cleanedUp: true,
      passed,
    });
  } catch (error) {
    for (const id of cleanupIds) {
      await supabase.from("ag_daily_cycles").delete().eq("id", id);
    }
    return NextResponse.json({
      agDailyCycleOrchestratorDiagnostic: true,
      zeroResearch: true,
      zeroExecution: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG orchestrator diagnostic failed.",
    }, { status: 500 });
  }
}
