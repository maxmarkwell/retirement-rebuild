import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAgHoldingReassessmentCandidates } from "./holding-reassessment";
import { runAgHoldingReview, type AgHoldingReviewDecision } from "./holding-review";

export type PersistedAgHoldingReviewDecision = {
  decisionId: string;
  symbol: string;
  decision: AgHoldingReviewDecision["decision"];
  reused: boolean;
};

export type AgHoldingReviewPipelineResult = {
  portfolioId: string;
  eraId: string;
  candidateCount: number;
  completedCount: number;
  failedCount: number;
  decisions: AgHoldingReviewDecision[];
  errors: Array<{ symbol: string; message: string }>;
};

export function getAgHoldingDecisionLifecycleAction(input: {
  existingActiveDecisionType: string | null;
  nextDecision: AgHoldingReviewDecision["decision"];
}): "REUSE" | "INSERT_SUPERSEDING" {
  if (!input.existingActiveDecisionType) return "INSERT_SUPERSEDING";
  const existing = input.existingActiveDecisionType === "sell" ? "SELL"
    : input.existingActiveDecisionType === "hold" ? "HOLD"
    : null;
  return existing === input.nextDecision ? "REUSE" : "INSERT_SUPERSEDING";
}

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

export async function persistAgHoldingReviewDecisions(
  portfolioId: string,
  decisions: AgHoldingReviewDecision[]
): Promise<PersistedAgHoldingReviewDecision[]> {
  if (decisions.length === 0) return [];
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id, inception_at")
    .eq("portfolio_id", portfolioId).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth strategy era is required.");

  const persisted: PersistedAgHoldingReviewDecision[] = [];
  for (const decision of decisions) {
    const decisionType = decision.decision === "SELL" ? "sell" : "hold";
    const { data: existing, error: existingError } = await supabase.from("investment_decisions")
      .select("id, decision_type, transaction_id")
      .eq("portfolio_id", portfolioId).eq("ticker", decision.symbol).eq("source", "ai_committee")
      .eq("status", "active").gte("created_at", era.inception_at).maybeSingle();
    if (existingError) throw new Error(`Unable to inspect active holding decision for ${decision.symbol}: ${existingError.message}`);

    if (existing && getAgHoldingDecisionLifecycleAction({ existingActiveDecisionType: existing.decision_type, nextDecision: decision.decision }) === "REUSE") {
      persisted.push({ decisionId: existing.id, symbol: decision.symbol, decision: decision.decision, reused: true });
      continue;
    }

    if (existing) {
      const { error: supersedeError } = await supabase.from("investment_decisions")
        .update({ status: "superseded" }).eq("id", existing.id).eq("status", "active");
      if (supersedeError) throw new Error(`Unable to supersede prior holding decision for ${decision.symbol}: ${supersedeError.message}`);
    }

    const { data, error } = await supabase.from("investment_decisions").insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      ticker: decision.symbol,
      decision_type: decisionType,
      decision_date: new Date().toISOString(),
      source: "ai_committee",
      status: "active",
      thesis: decision.ownershipThesis,
      confidence_score: decision.confidence,
      expected_holding_period: decision.thesisClock,
      reassessment_conditions: decision.requiredMonitoring.join("\n"),
      exit_conditions: decision.invalidation.join("\n"),
      bull_case: decision.strongestEvidence.join("\n"),
      bear_case: decision.strongestCounterEvidence.join("\n"),
      primary_risks: decision.strongestCounterEvidence.join("\n"),
      recommended_quantity: null,
      recommended_allocation: null,
      notes: JSON.stringify({ agHoldingReview: true, rationale: decision.rationale, model: decision.model, promptVersion: decision.promptVersion }),
    }).select("id").single();
    if (error || !data) throw new Error(`Unable to persist AG holding review for ${decision.symbol}: ${error?.message ?? "unknown error"}`);
    persisted.push({ decisionId: data.id, symbol: decision.symbol, decision: decision.decision, reused: false });
  }
  return persisted;
}
