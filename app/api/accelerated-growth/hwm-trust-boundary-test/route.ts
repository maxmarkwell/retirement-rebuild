import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG HWM trust-boundary test is disabled in production." }, { status: 404 });
  }
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: eraBefore, error: beforeError } = await supabase
      .from("portfolio_strategy_eras")
      .select("id,high_water_mark,reference_total_capital")
      .eq("user_id", user.id)
      .eq("strategy_key", "accelerated_growth")
      .eq("execution_mode", "paper")
      .is("ended_at", null)
      .single();
    if (beforeError || !eraBefore) throw new Error("Open AG paper era not found.");

    const hwmBefore = Number(eraBefore.high_water_mark);
    const forgedEquity = 10000;
    const { error: attackError } = await supabase.rpc("advance_ag_high_water_mark", {
      p_era_id: eraBefore.id,
      p_current_equity: forgedEquity,
    });

    const { data: eraAfter, error: afterError } = await supabase
      .from("portfolio_strategy_eras")
      .select("id,high_water_mark")
      .eq("id", eraBefore.id).eq("user_id", user.id).single();
    if (afterError || !eraAfter) throw new Error("Unable to verify AG HWM after attack.");

    const hwmAfter = Number(eraAfter.high_water_mark);
    const blocked = Boolean(attackError);
    const unchanged = hwmAfter === hwmBefore;

    return NextResponse.json({
      hwmTrustBoundaryTest: true,
      forgedEquity,
      blocked,
      unchanged,
      passed: blocked && unchanged,
      error: attackError?.message ?? null,
      before: { eraId: eraBefore.id, highWaterMark: hwmBefore },
      after: { eraId: eraAfter.id, highWaterMark: hwmAfter },
    });
  } catch (error) {
    return NextResponse.json(
      { hwmTrustBoundaryTest: false, error: error instanceof Error ? error.message : "Unknown HWM trust-boundary test error." },
      { status: 400 },
    );
  }
}
