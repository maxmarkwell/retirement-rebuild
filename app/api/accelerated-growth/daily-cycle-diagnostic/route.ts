import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function denverCycleDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function diagnosticCycleDate(now = new Date()): string {
  // Generate a unique historical date in the 1800s so repeated diagnostics never
  // collide with a stale fixture and can never consume a genuine operating date.
  const dayIndex = Math.floor(now.getTime() / 1000) % 36500;
  const date = new Date(Date.UTC(1800, 0, 1 + dayIndex));
  return date.toISOString().slice(0, 10);
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG daily-cycle diagnostic is disabled in production." }, { status: 404 });
  }

  let diagnosticRowId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios")
      .select("id")
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

    const diagnosticDate = diagnosticCycleDate();
    const now = new Date().toISOString();
    const first = await supabase.from("ag_daily_cycles").insert({
      user_id: user.id,
      portfolio_id: portfolio.id,
      strategy_era_id: era.id,
      cycle_date: diagnosticDate,
      status: "running",
      max_candidates: 1,
      started_at: now,
      updated_at: now,
    }).select("id, status, cycle_date").single();
    if (first.error || !first.data) throw new Error(`Unable to create AG diagnostic cycle: ${first.error?.message ?? "unknown error"}`);
    diagnosticRowId = first.data.id;

    const duplicate = await supabase.from("ag_daily_cycles").insert({
      user_id: user.id,
      portfolio_id: portfolio.id,
      strategy_era_id: era.id,
      cycle_date: diagnosticDate,
      status: "running",
      max_candidates: 1,
      started_at: now,
      updated_at: now,
    });

    const failedAt = new Date().toISOString();
    const failed = await supabase.from("ag_daily_cycles").update({
      status: "failed",
      completed_at: failedAt,
      failure_message: "Synthetic transient failure for zero-research diagnostic.",
      universe_count: 10,
      preselected_count: 2,
      evaluated_count: 1,
      updated_at: failedAt,
    }).eq("id", first.data.id).eq("status", "running").select("id, status, failure_message").single();
    if (failed.error || !failed.data) throw new Error(`Unable to fail AG diagnostic cycle: ${failed.error?.message ?? "unknown error"}`);

    const ordinaryReuse = await supabase.from("ag_daily_cycles")
      .select("id, status, failure_message")
      .eq("id", first.data.id)
      .single();
    if (ordinaryReuse.error || !ordinaryReuse.data) throw new Error(`Unable to inspect failed AG diagnostic cycle: ${ordinaryReuse.error?.message ?? "unknown error"}`);

    const retryAt = new Date().toISOString();
    const retry = await supabase.from("ag_daily_cycles").update({
      status: "running",
      max_candidates: 1,
      started_at: retryAt,
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
      updated_at: retryAt,
    }).eq("id", first.data.id).eq("status", "failed")
      .select("id, status, failure_message, universe_count, completed_at").single();
    if (retry.error || !retry.data) throw new Error(`Unable to retry AG diagnostic cycle: ${retry.error?.message ?? "unknown error"}`);

    const completedAt = new Date().toISOString();
    const completion = await supabase.from("ag_daily_cycles").update({
      status: "completed",
      completed_at: completedAt,
      universe_count: 0,
      preselected_count: 0,
      evaluated_count: 0,
      discovery_advance_count: 0,
      catalyst_supported_count: 0,
      deep_research_completed_count: 0,
      deep_research_failed_count: 0,
      proceed_count: 0,
      committee_decision_count: 0,
      persisted_decision_count: 0,
      updated_at: completedAt,
    }).eq("id", first.data.id).eq("status", "running")
      .select("id, status, cycle_date, completed_at").single();
    if (completion.error || !completion.data) throw new Error(`Unable to complete retried AG diagnostic cycle: ${completion.error?.message ?? "unknown error"}`);

    const authoritative = await supabase.from("ag_daily_cycles")
      .select("id, status, cycle_date")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("strategy_era_id", era.id)
      .eq("cycle_date", diagnosticDate);
    if (authoritative.error) throw new Error(`Unable to verify AG diagnostic cycle: ${authoritative.error.message}`);

    const duplicateBlocked = Boolean(duplicate.error);
    const failedPersisted = ordinaryReuse.data.status === "failed" && Boolean(ordinaryReuse.data.failure_message);
    const retryReusedSameRow = retry.data.id === first.data.id;
    const retryResetState = retry.data.status === "running" && retry.data.failure_message === null && retry.data.universe_count === null && retry.data.completed_at === null;
    const oneAuthoritativeRow = (authoritative.data ?? []).length === 1 && authoritative.data?.[0]?.id === first.data.id;
    const completed = completion.data.status === "completed";
    const passed = duplicateBlocked && failedPersisted && retryReusedSameRow && retryResetState && oneAuthoritativeRow && completed;

    const cleanup = await supabase.from("ag_daily_cycles").delete().eq("id", first.data.id);
    if (cleanup.error) throw new Error(`AG daily-cycle diagnostic passed but cleanup failed: ${cleanup.error.message}`);
    diagnosticRowId = null;

    return NextResponse.json({
      dailyCycleDiagnostic: true,
      zeroResearch: true,
      todayCycleDate: denverCycleDate(),
      diagnosticDate,
      duplicateBlocked,
      failedPersisted,
      retryReusedSameRow,
      retryResetState,
      oneAuthoritativeRow,
      completed,
      cleanedUp: true,
      passed,
    });
  } catch (error) {
    if (diagnosticRowId) {
      try {
        const supabase = await createClient();
        await supabase.from("ag_daily_cycles").delete().eq("id", diagnosticRowId);
      } catch {
        // Preserve the original diagnostic failure.
      }
    }
    return NextResponse.json({
      dailyCycleDiagnostic: true,
      zeroResearch: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG daily-cycle diagnostic failed.",
    }, { status: 500 });
  }
}
