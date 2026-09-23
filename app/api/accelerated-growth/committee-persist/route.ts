import { NextRequest, NextResponse } from "next/server";
import { runAgCommitteePipeline, persistAgCommitteeDecisions, persistAgResearchWatchlist } from "@/lib/discovery/accelerated-growth/committee-pipeline";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function denverCycleDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG Committee persistence diagnostic is disabled in production." }, { status: 404 });
  }

  let cycleId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id, type")
      .eq("user_id", user.id)
      .eq("type", "paper_active")
      .single();
    if (portfolioError || !portfolio) {
      return NextResponse.json({ error: "paper_active portfolio not found." }, { status: 400 });
    }

    const { data: era, error: eraError } = await supabase
      .from("portfolio_strategy_eras")
      .select("id")
      .eq("portfolio_id", portfolio.id)
      .eq("user_id", user.id)
      .eq("strategy_key", "accelerated_growth")
      .eq("execution_mode", "paper")
      .is("ended_at", null)
      .single();
    if (eraError || !era) {
      return NextResponse.json({ error: "An open paper Accelerated Growth strategy era is required." }, { status: 400 });
    }

    const requested = Number(request.nextUrl.searchParams.get("max") ?? "5");
    const maxCandidates = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 5)) : 5;
    const retryFailed = request.nextUrl.searchParams.get("retryFailed") === "true";
    const cycleDate = denverCycleDate();

    const { data: existing, error: existingError } = await supabase
      .from("ag_daily_cycles")
      .select("*")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("strategy_era_id", era.id)
      .eq("cycle_date", cycleDate)
      .maybeSingle();
    if (existingError) throw new Error(`Unable to check today's AG cycle: ${existingError.message}`);

    if (existing && !(retryFailed && existing.status === "failed")) {
      return NextResponse.json({
        persisted: existing.status === "completed",
        reusedDailyCycle: true,
        retryAvailable: existing.status === "failed",
        transactionsWritten: false,
        portfolioId: portfolio.id,
        cycle: existing,
      });
    }

    const now = new Date().toISOString();

    if (existing && retryFailed && existing.status === "failed") {
      const { data: retried, error: retryError } = await supabase
        .from("ag_daily_cycles")
        .update({
          status: "running",
          max_candidates: maxCandidates,
          started_at: now,
          completed_at: null,
          failure_message: null,
          universe_count: null,
          preselected_count: null,
          evaluated_count: null,
          discovery_advance_count: null,
          catalyst_supported_count: null,
          deep_research_completed_count: null,
          deep_research_failed_count: null,
          proceed_count: null,
          committee_decision_count: null,
          persisted_decision_count: null,
          updated_at: now,
        })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();

      if (retryError) throw new Error(`Unable to retry today's failed AG cycle: ${retryError.message}`);
      if (!retried) {
        const { data: current } = await supabase.from("ag_daily_cycles").select("*").eq("id", existing.id).single();
        return NextResponse.json({
          persisted: current?.status === "completed",
          reusedDailyCycle: true,
          retryAvailable: current?.status === "failed",
          transactionsWritten: false,
          portfolioId: portfolio.id,
          cycle: current,
        });
      }
      cycleId = retried.id;
    } else {
      const { data: cycle, error: cycleError } = await supabase
        .from("ag_daily_cycles")
        .insert({
          user_id: user.id,
          portfolio_id: portfolio.id,
          strategy_era_id: era.id,
          cycle_date: cycleDate,
          status: "running",
          max_candidates: maxCandidates,
          started_at: now,
          updated_at: now,
        })
        .select("id")
        .single();

      if (cycleError || !cycle) {
        const { data: racedCycle } = await supabase
          .from("ag_daily_cycles")
          .select("*")
          .eq("user_id", user.id)
          .eq("portfolio_id", portfolio.id)
          .eq("strategy_era_id", era.id)
          .eq("cycle_date", cycleDate)
          .maybeSingle();
        if (racedCycle) {
          return NextResponse.json({
            persisted: racedCycle.status === "completed",
            reusedDailyCycle: true,
            retryAvailable: racedCycle.status === "failed",
            transactionsWritten: false,
            portfolioId: portfolio.id,
            cycle: racedCycle,
          });
        }
        throw new Error(`Unable to start today's AG cycle: ${cycleError?.message ?? "unknown error"}`);
      }
      cycleId = cycle.id;
    }

    const pipeline = await runAgCommitteePipeline({ maxCandidates });

    if (pipeline.errors.length > 0 || pipeline.failedCount > 0) {
      const failureMessage = "Committee pipeline did not complete cleanly; no decisions were persisted.";
      await supabase.from("ag_daily_cycles").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        failure_message: failureMessage,
        universe_count: pipeline.upstream.discovery.universeCount,
        preselected_count: pipeline.upstream.discovery.preselectedCount,
        evaluated_count: pipeline.upstream.discovery.evaluatedCount,
        discovery_advance_count: pipeline.upstream.discovery.advanceCount,
        catalyst_supported_count: pipeline.upstream.catalystSupportedCount,
        deep_research_completed_count: pipeline.upstream.deepResearchCompletedCount,
        deep_research_failed_count: pipeline.upstream.deepResearchFailedCount,
        proceed_count: pipeline.upstream.proceedCount,
        committee_decision_count: pipeline.decisions.length,
        persisted_decision_count: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", cycleId);

      return NextResponse.json({
        persisted: false,
        reusedDailyCycle: false,
        retryAvailable: true,
        reason: failureMessage,
        pipeline,
      }, { status: 409 });
    }

    await persistAgResearchWatchlist(portfolio.id, pipeline.upstream.deepResearchOutcomes);
    const persisted = await persistAgCommitteeDecisions(portfolio.id, pipeline.decisions);
    const completedAt = new Date().toISOString();

    const { error: completionError } = await supabase.from("ag_daily_cycles").update({
      status: "completed",
      completed_at: completedAt,
      failure_message: null,
      universe_count: pipeline.upstream.discovery.universeCount,
      preselected_count: pipeline.upstream.discovery.preselectedCount,
      evaluated_count: pipeline.upstream.discovery.evaluatedCount,
      discovery_advance_count: pipeline.upstream.discovery.advanceCount,
      catalyst_supported_count: pipeline.upstream.catalystSupportedCount,
      deep_research_completed_count: pipeline.upstream.deepResearchCompletedCount,
      deep_research_failed_count: pipeline.upstream.deepResearchFailedCount,
      proceed_count: pipeline.upstream.proceedCount,
      committee_decision_count: pipeline.decisions.length,
      persisted_decision_count: persisted.length,
      updated_at: completedAt,
    }).eq("id", cycleId);
    if (completionError) throw new Error(`Unable to complete today's AG cycle: ${completionError.message}`);

    return NextResponse.json({
      persisted: true,
      reusedDailyCycle: false,
      retriedFailedCycle: Boolean(existing && retryFailed),
      researchWatchlistPersisted: true,
      transactionsWritten: false,
      portfolioId: portfolio.id,
      cycleId,
      cycleDate,
      committeeDecisionCount: pipeline.decisions.length,
      persistedCount: persisted.length,
      persistedDecisions: persisted,
      decisions: pipeline.decisions,
      upstream: pipeline.upstream,
    });
  } catch (error) {
    if (cycleId) {
      try {
        const supabase = await createClient();
        await supabase.from("ag_daily_cycles").update({
          status: "failed",
          completed_at: new Date().toISOString(),
          failure_message: error instanceof Error ? error.message : "AG daily cycle failed.",
          updated_at: new Date().toISOString(),
        }).eq("id", cycleId).eq("status", "running");
      } catch {
        // Preserve the original failure response; the running row remains visible for diagnosis.
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AG Committee persistence diagnostic failed." },
      { status: 500 }
    );
  }
}
