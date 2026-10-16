import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgValuationSnapshot } from "@/lib/discovery/accelerated-growth/valuation-snapshot";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED = new Set(["AMAT", "INOD", "SNX", "QMCO", "AXTI", "COP", "RGR"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { ticker?: unknown } | null;
  const ticker = typeof body?.ticker === "string" ? body.ticker.toUpperCase().trim() : "";
  if (!ALLOWED.has(ticker)) return NextResponse.json({ error: "Ticker is not in the historical review set." }, { status: 400 });

  const { data: originals, error: originalError } = await supabase
    .from("investment_decisions")
    .select("id,ticker,decision_type,thesis,bull_case,bear_case,reassessment_conditions,exit_conditions,confidence_score,created_at")
    .eq("user_id", user.id)
    .eq("ticker", ticker)
    .eq("source", "ai_committee")
    .eq("decision_type", "watch")
    .gte("created_at", "2026-10-16T00:00:00Z")
    .lt("created_at", "2026-10-17T00:00:00Z")
    .order("created_at", { ascending: true }).limit(1);
  if (originalError || !originals?.length) return NextResponse.json({ error: "Historical WATCH baseline not found." }, { status: 404 });
  const original = originals[0];

  const { data: prior, error: priorError } = await supabase
    .from("ag_historical_reassessments")
    .select("id")
    .eq("user_id", user.id)
    .eq("original_decision_id", original.id)
    .limit(1);
  if (priorError) return NextResponse.json({ error: "Unable to check prior reassessments." }, { status: 500 });
  if (prior?.length) return NextResponse.json({ error: "Already reassessed; see comparison endpoint." }, { status: 409 });

  // Reconstructed from saved committee outputs, NOT the original full deep-research dossier.
  // The committee must see this limitation explicitly; never label it fresh research.
  const research: AgDeepResearch = {
    symbol: ticker, companyName: null, researchStatus: "PROCEED",
    thesis: original.thesis ?? "",
    catalystAssessment: "Historical committee thesis only; underlying original catalyst dossier was not persisted.",
    durabilityAssessment: original.bear_case ?? "Original detailed durability evidence unavailable.",
    financialAssessment: "Original detailed financial research was not persisted. Use the supplied current deterministic valuation snapshot; do not assume historical financial data is current.",
    valuationAssessment: "Historical committee did not receive deterministic valuation snapshot. Reassess with the supplied current snapshot.",
    evidenceFor: [original.bull_case || original.thesis || "Historical positive evidence not available."],
    evidenceAgainst: [original.bear_case || "Historical negative evidence not available."],
    unresolvedQuestions: [original.reassessment_conditions || "Original unresolved questions unavailable."],
    thesisClock: "Historical decision made October 16, 2026; do not assume the original thesis clock remains valid.",
    invalidation: [original.exit_conditions || "Original invalidation details unavailable."],
    confidence: Number(original.confidence_score ?? 0),
    model: "historical-committee-output-reconstruction",
    promptVersion: "ag-historical-reconstruction-v1",
    priorWatchReassessed: true,
  };

  try {
    const valuation = await getAgValuationSnapshot(ticker);
    const result = await runAgCommittee(research, valuation);
    const { data: saved, error: saveError } = await supabase
      .from("ag_historical_reassessments")
      .insert({
        user_id: user.id,
        original_decision_id: original.id,
        ticker,
        original_decision_type: original.decision_type,
        reassessed_decision_type: result.decision,
        original_thesis: original.thesis ?? "",
        reassessment_thesis: result.ownershipThesis,
        reassessment_rationale: result.committeeRationale,
        valuation_evidence: result.valuationEvidence,
        valuation_data_quality: result.valuationDataQuality,
        research_basis: "RECONSTRUCTED_HISTORICAL",
        committee_model: result.model,
        committee_prompt_version: result.promptVersion,
      })
      .select("id").single();
    if (saveError || !saved) return NextResponse.json({ error: "Committee finished but comparison could not be saved; do not retry until reconciled." }, { status: 500 });
    return NextResponse.json({
      comparisonId: saved.id, ticker, originalDecision: "WATCH",
      reassessedDecision: result.decision, rationale: result.committeeRationale,
      valuationEvidence: result.valuationEvidence, valuationDataQuality: result.valuationDataQuality,
      researchBasis: "RECONSTRUCTED_HISTORICAL",
      limitation: "Original deep research dossier was not saved; this is not a fresh full-research evaluation.",
      transactionsEnabled: false, transactionsWritten: false,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reassessment failed.", transactionsWritten: false }, { status: 500 });
  }
}
