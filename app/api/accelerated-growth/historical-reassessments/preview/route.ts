import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgValuationSnapshot } from "@/lib/discovery/accelerated-growth/valuation-snapshot";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Explicitly read-only, authenticated historical committee preview.
// Does not create decisions, comparisons, orders or transactions.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { ticker?: unknown } | null;
  const ticker = typeof body?.ticker === "string" ? body.ticker.toUpperCase().trim() : "";
  if (ticker !== "INOD") return NextResponse.json({ error: "Preview currently limited to INOD validation." }, { status: 400 });

  const { data: originals, error: originalError } = await supabase.from("investment_decisions")
    .select("id,ticker,decision_type,thesis,bull_case,bear_case,reassessment_conditions,exit_conditions,confidence_score,created_at")
    .eq("user_id", user.id).eq("ticker", ticker).eq("source", "ai_committee")
    .eq("decision_type", "watch").gte("created_at", "2026-10-16T00:00:00Z")
    .lt("created_at", "2026-10-17T00:00:00Z").order("created_at", { ascending: true }).limit(1);
  if (originalError || !originals?.length) return NextResponse.json({ error: "Historical WATCH baseline not found." }, { status: 404 });
  const original = originals[0];

  const research: AgDeepResearch = {
    symbol: ticker, companyName: null, researchStatus: "PROCEED",
    thesis: original.thesis ?? "",
    catalystAssessment: "Historical committee thesis only; original full catalyst dossier was not persisted.",
    durabilityAssessment: original.bear_case ?? "Original durability evidence unavailable.",
    financialAssessment: "Original financial research was not persisted. Current deterministic snapshot is distinct from historical evidence.",
    valuationAssessment: "Original historical committee did not receive the current deterministic valuation snapshot.",
    evidenceFor: [original.bull_case || original.thesis || "Original positive evidence unavailable."],
    evidenceAgainst: [original.bear_case || "Original negative evidence unavailable."],
    unresolvedQuestions: [original.reassessment_conditions || "Original unresolved questions unavailable."],
    thesisClock: "Historical decision dated October 16, 2026; original clock may no longer apply.",
    invalidation: [original.exit_conditions || "Original invalidation unavailable."],
    confidence: Number(original.confidence_score ?? 0),
    model: "historical-committee-output-reconstruction",
    promptVersion: "ag-historical-reconstruction-v1",
    priorWatchReassessed: true,
  };
  try {
    const valuation = await getAgValuationSnapshot(ticker);
    const decision = await runAgCommittee(research, valuation);
    return NextResponse.json({
      mode: "READ_ONLY_HISTORICAL_PREVIEW", ticker,
      researchBasis: "RECONSTRUCTED_HISTORICAL",
      limitation: "Original full Deep Research dossier was not saved; this is not a fresh research evaluation.",
      valuationSnapshot: valuation, decision,
      decisionsPersisted: false, comparisonsPersisted: false, transactionsWritten: false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed.", transactionsWritten: false }, { status: 500 });
  }
}
