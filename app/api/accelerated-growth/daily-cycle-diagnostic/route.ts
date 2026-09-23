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

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG daily-cycle diagnostic is disabled in production." }, { status: 404 });
  }

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

    // Use a deliberately impossible historical date so this diagnostic never
    // consumes today's genuine research-cycle slot.
    const diagnosticDate = "1900-01-01";
    const before = await supabase.from("ag_daily_cycles")
      .select("id, status, cycle_date")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("strategy_era_id", era.id)
      .eq("cycle_date", diagnosticDate);
    if (before.error) throw new Error(`Unable to inspect AG diagnostic cycle: ${before.error.message}`);

    if ((before.data ?? []).length > 0) {
      const { error: cleanupError } = await supabase.from("ag_daily_cycles")
        .delete()
        .eq("user_id", user.id)
        .eq("portfolio_id", portfolio.id)
        .eq("strategy_era_id", era.id)
        .eq("cycle_date", diagnosticDate);
      if (cleanupError) throw new Error(`Unable to reset AG diagnostic cycle: ${cleanupError.message}`);
    }

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
    }).eq("id", first.data.id).select("id, status, cycle_date, completed_at").single();
    if (completion.error || !completion.data) throw new Error(`Unable to complete AG diagnostic cycle: ${completion.error?.message ?? "unknown error"}`);

    const authoritative = await supabase.from("ag_daily_cycles")
      .select("id, status, cycle_date")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolio.id)
      .eq("strategy_era_id", era.id)
      .eq("cycle_date", diagnosticDate);
    if (authoritative.error) throw new Error(`Unable to verify AG diagnostic cycle: ${authoritative.error.message}`);

    const duplicateBlocked = Boolean(duplicate.error);
    const oneAuthoritativeRow = (authoritative.data ?? []).length === 1;
    const completed = completion.data.status === "completed";
    const passed = duplicateBlocked && oneAuthoritativeRow && completed;

    const { error: cleanupError } = await supabase.from("ag_daily_cycles")
      .delete()
      .eq("id", first.data.id);
    if (cleanupError) throw new Error(`AG daily-cycle diagnostic passed but cleanup failed: ${cleanupError.message}`);

    return NextResponse.json({
      dailyCycleDiagnostic: true,
      zeroResearch: true,
      todayCycleDate: denverCycleDate(),
      diagnosticDate,
      duplicateBlocked,
      oneAuthoritativeRow,
      completed,
      cleanedUp: true,
      passed,
    });
  } catch (error) {
    return NextResponse.json({
      dailyCycleDiagnostic: true,
      zeroResearch: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG daily-cycle diagnostic failed.",
    }, { status: 500 });
  }
}
