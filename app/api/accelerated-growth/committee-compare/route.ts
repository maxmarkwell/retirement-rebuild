import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgV2Committee } from "@/lib/discovery/accelerated-growth/opportunity-committee";
import type { AgOpportunityDeepResearch } from "@/lib/discovery/accelerated-growth/opportunity-deep-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const SOURCE_SCAN_ID = "90a8c1d9-3746-438a-979e-8c16ce2ca264";
const SYMBOLS = ["TLS", "BILL", "GH", "MAIR", "COLM"] as const;

// Isolated side-by-side experiment. One model call per explicit request.
// Never inserts, updates, or reclassifies investment decisions or scan records.
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const symbol = (body as { symbol?: unknown } | null)?.symbol;
    if (typeof symbol !== "string" || !SYMBOLS.includes(symbol as typeof SYMBOLS[number]))
      return NextResponse.json({ error: "AG_COMPARISON_INVALID_SYMBOL" }, { status: 400 });
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "AG_COMPARISON_AUTH_REQUIRED" }, { status: 401 });
    const { data: scan, error } = await db.from("discovery_scan_runs")
      .select("status,stage,scoring_version,portfolio_type,state")
      .eq("id", SOURCE_SCAN_ID).eq("user_id", user.id).maybeSingle();
    if (error || !scan || scan.status !== "completed" || scan.stage !== "ag_v2_committee_complete" ||
      scan.scoring_version !== "ag-opportunity-v2" || scan.portfolio_type !== "paper_active")
      return NextResponse.json({ error: "AG_COMPARISON_SAVED_SCAN_UNAVAILABLE" }, { status: 409 });
    const state = scan.state as { deepResults?: AgOpportunityDeepResearch[];
      committeeResults?: Array<{ symbol: string; decision: string; rationale: string;
        valuationEvidence: string; promptVersion: string; ownershipThesis: string }> } | null;
    if (!state || state.deepResults?.length !== 5 || state.committeeResults?.length !== 5 ||
      state.deepResults.some((r,i) => r.symbol !== SYMBOLS[i]) ||
      state.committeeResults.some((r,i) => r.symbol !== SYMBOLS[i] ||
        r.promptVersion !== "ag-opportunity-committee-v1"))
      return NextResponse.json({ error: "AG_COMPARISON_INVALID_HISTORICAL_EVIDENCE" }, { status: 409 });
    const i = SYMBOLS.indexOf(symbol as typeof SYMBOLS[number]);
    const oldDecision = state.committeeResults[i];
    if (typeof oldDecision.valuationEvidence !== "string" || oldDecision.valuationEvidence.length < 30)
      return NextResponse.json({ error: "AG_COMPARISON_MISSING_ORIGINAL_VALUATION" }, { status: 409 });
    const newDecision = await runAgV2Committee(state.deepResults[i], {
      historicalValuationText: oldDecision.valuationEvidence,
    });
    return NextResponse.json({ symbol, original: oldDecision, revised: newDecision,
      evidenceBasis: "SAVED_DEEP_DOSSIER_PLUS_ORIGINAL_COMMITTEE_VALUATION_TEXT",
      note: "Not an identical raw-input replay. The historical valuation is saved Committee prose, not the original raw snapshot. No current quote or valuation refresh; results are ephemeral and not stored.",
      executionEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "AG_COMPARISON_EVALUATION_FAILED", executionEnabled: false }, { status: 500 });
  }
}
