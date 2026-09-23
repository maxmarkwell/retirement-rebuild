import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgHoldingReassessmentCandidates } from "./holding-reassessment";
import { runAgHoldingReview, type AgHoldingReviewDecision } from "./holding-review";

export type AgHoldingReviewPipelineResult = {
  portfolioId: string;
  eraId: string;
  candidateCount: number;
  completedCount: number;
  failedCount: number;
  decisions: AgHoldingReviewDecision[];
  errors: Array<{ symbol: string; message: string }>;
};

export async function runAgHoldingReviewPipeline(): Promise<AgHoldingReviewPipelineResult> {
  const plan = await getAgHoldingReassessmentCandidates();
  const decisions: AgHoldingReviewDecision[] = [];
  const errors: Array<{ symbol: string; message: string }> = [];

  for (const candidate of plan.candidates) {
    try {
      decisions.push(await runAgHoldingReview(candidate));
    } catch (error) {
      errors.push({ symbol: candidate.ticker, message: error instanceof Error ? error.message : "Holding review failed." });
    }
  }

  return {
    portfolioId: plan.portfolioId,
    eraId: plan.eraId,
    candidateCount: plan.candidates.length,
    completedCount: decisions.length,
    failedCount: errors.length,
    decisions,
    errors,
  };
}

export async function persistAgHoldingReviewDecisions(portfolioId: string, decisions: AgHoldingReviewDecision[]) {
  if (decisions.length === 0) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const persisted: Array<{ id: string; ticker: string; decision_type: string; status: string }> = [];
  for (const decision of decisions) {
    const decisionType = decision.decision === "SELL" ? "sell" : "hold";
    const { data, error } = await supabase.from("investment_decisions").insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      ticker: decision.symbol,
      decision_type: decisionType,
      source: "ai_committee",
      status: "active",
      thesis: decision.ownershipThesis,
      confidence_score: decision.confidence,
      notes: JSON.stringify({
        agHoldingReview: true,
        rationale: decision.rationale,
        strongestEvidence: decision.strongestEvidence,
        strongestCounterEvidence: decision.strongestCounterEvidence,
        requiredMonitoring: decision.requiredMonitoring,
        thesisClock: decision.thesisClock,
        invalidation: decision.invalidation,
        model: decision.model,
        promptVersion: decision.promptVersion,
      }),
    }).select("id, ticker, decision_type, status").single();
    if (error || !data) throw new Error(`Unable to persist AG holding review for ${decision.symbol}: ${error?.message ?? "unknown error"}`);
    persisted.push(data);
  }
  return persisted;
}
