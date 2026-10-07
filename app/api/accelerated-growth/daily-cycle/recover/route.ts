import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const cycleId = typeof body.cycleId === "string" ? body.cycleId : "";
    if (!cycleId) return NextResponse.json({ error: "cycleId is required." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const reason = "Manual recovery after autonomous research failure. Failure evidence preserved; no persistence or transactions executed.";
    const { data, error } = await supabase.rpc("ag_recover_cycle_to_failed", {
      p_cycle_id: cycleId,
      p_reason: reason,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });

    return NextResponse.json({
      recovered: data === true,
      cycleId,
      executionEnabled: false,
      transactionsWritten: false,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "AG recovery failed.",
    }, { status: 500 });
  }
}
