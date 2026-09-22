import { runAgDeepResearchPipeline } from "./deep-research-pipeline";
import { runAgCommittee, type AgCommitteeDecision } from "./committee";
import { createClient } from "@/lib/supabase/server";
import { deriveAgExecutionEvidence } from "./execution-evidence";
import { getDynamicDiscoveryUniverse } from "../dynamic-universe";
import { fromAgPersistedDecisionType, getAgDecisionLifecycleAction, toAgPersistedDecisionType } from "./decision-lifecycle";

export type PersistedAgCommitteeDecision = {
  decisionId: string;
  symbol: string;
  decision: AgCommitteeDecision["decision"];
};

export type AgCommitteePipelineResult = {
  upstream: {
    discovery: Awaited<ReturnType<typeof runAgDeepResearchPipeline>>["discovery"];
    catalystSupportedCount: number;
    deepResearchCompletedCount: number;
    deepResearchFailedCount: number;
    proceedCount: number;
    deepResearchOutcomes: Array<{
      symbol: string;
      companyName: string | null;
      researchStatus: "PROCEED" | "WATCH" | "STOP";
      confidence: number;
      thesis: string;
      unresolvedQuestions: string[];
      thesisClock: string;
      invalidation: string[];
      model: string;
      promptVersion: string;
    }>;
  };
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  decisions: AgCommitteeDecision[];
  errors: Array<{ symbol: string; stage: "UPSTREAM" | "COMMITTEE"; error: string }>;
};

export async function runAgCommitteePipeline(options?: { maxCandidates?: number }): Promise<AgCommitteePipelineResult> {
  const upstream = await runAgDeepResearchPipeline({ maxCandidates: options?.maxCandidates ?? 5 });
  const proceed = upstream.results.filter((result) => result.researchStatus === "PROCEED");

  const upstreamSummary = {
    discovery: upstream.discovery,
    catalystSupportedCount: upstream.catalystSupportedCount,
    deepResearchCompletedCount: upstream.completedCount,
    deepResearchFailedCount: upstream.failedCount,
    proceedCount: proceed.length,
    deepResearchOutcomes: upstream.results.map((result) => ({
      symbol: result.symbol,
      companyName: result.companyName,
      researchStatus: result.researchStatus,
      confidence: result.confidence,
      thesis: result.thesis,
      unresolvedQuestions: result.unresolvedQuestions,
      thesisClock: result.thesisClock,
      invalidation: result.invalidation,
      model: result.model,
      promptVersion: result.promptVersion,
    })),
  };

  if (upstream.errors.length > 0 || upstream.discovery.rateLimited || upstream.discovery.stoppedEarly) {
    return {
      upstream: upstreamSummary,
      requestedCount: 0,
      completedCount: 0,
      failedCount: 0,
      decisions: [],
      errors: [{ symbol: "UPSTREAM", stage: "UPSTREAM", error: "AG Committee skipped because upstream research did not complete cleanly." }],
    };
  }

  const decisions: AgCommitteeDecision[] = [];
  const errors: AgCommitteePipelineResult["errors"] = [];

  // Committee is intentionally sequential and only receives Deep Research PROCEED candidates.
  for (const research of proceed) {
    try {
      decisions.push(await runAgCommittee(research));
    } catch (error) {
      errors.push({ symbol: research.symbol, stage: "COMMITTEE", error: error instanceof Error ? error.message : "Unknown AG Committee error." });
    }
  }

  return {
    upstream: upstreamSummary,
    requestedCount: proceed.length,
    completedCount: decisions.length,
    failedCount: errors.length,
    decisions,
    errors,
  };
}


export async function persistAgResearchWatchlist(
  portfolioId: string,
  outcomes: AgCommitteePipelineResult["upstream"]["deepResearchOutcomes"]
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: era, error: eraError } = await supabase
    .from("portfolio_strategy_eras")
    .select("id, inception_at")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper")
    .is("ended_at", null)
    .single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth strategy era is required.");

  const seen = new Set(outcomes.map((outcome) => outcome.symbol.toUpperCase()));

  for (const outcome of outcomes) {
    const ticker = outcome.symbol.toUpperCase();
    const { data: existing, error: existingError } = await supabase
      .from("ag_research_watchlist")
      .select("id")
      .eq("user_id", user.id)
      .eq("portfolio_id", portfolioId)
      .eq("strategy_era_id", era.id)
      .eq("ticker", ticker)
      .is("resolved_at", null)
      .maybeSingle();
    if (existingError) throw new Error(`Unable to load AG research watch for ${ticker}: ${existingError.message}`);

    if (outcome.researchStatus === "WATCH") {
      const values = {
        research_status: "WATCH",
        confidence: outcome.confidence,
        thesis: outcome.thesis,
        unresolved_questions: outcome.unresolvedQuestions,
        thesis_clock: outcome.thesisClock,
        invalidation: outcome.invalidation,
        model: outcome.model,
        prompt_version: outcome.promptVersion,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const query = existing
        ? supabase.from("ag_research_watchlist").update(values).eq("id", existing.id)
        : supabase.from("ag_research_watchlist").insert({
            ...values,
            user_id: user.id,
            portfolio_id: portfolioId,
            strategy_era_id: era.id,
            ticker,
            company_name: outcome.companyName,
          });
      const { error } = await query;
      if (error) throw new Error(`Unable to persist AG research watch for ${ticker}: ${error.message}`);
    } else if (existing) {
      const { error } = await supabase.from("ag_research_watchlist").update({
        resolved_at: new Date().toISOString(),
        resolution: outcome.researchStatus,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw new Error(`Unable to resolve AG research watch for ${ticker}: ${error.message}`);
    }
  }
}

export async function persistAgCommitteeDecisions(
  portfolioId: string,
  decisions: AgCommitteeDecision[]
): Promise<PersistedAgCommitteeDecision[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, type")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();
  if (portfolioError || !portfolio || portfolio.type !== "paper_active") {
    throw new Error("AG decisions may only be persisted to the paper_active portfolio.");
  }

  const { data: era, error: eraError } = await supabase
    .from("portfolio_strategy_eras")
    .select("id, strategy_key, strategy_version, execution_mode, inception_at")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth")
    .eq("execution_mode", "paper")
    .is("ended_at", null)
    .single();
  if (eraError || !era) throw new Error("An open paper Accelerated Growth strategy era is required.");

  const persisted: PersistedAgCommitteeDecision[] = [];
  const hasBuyDecision = decisions.some((decision) => decision.decision === "BUY");
  const evidenceUniverse = hasBuyDecision ? await getDynamicDiscoveryUniverse() : [];

  for (const decision of decisions) {
    const decisionType = toAgPersistedDecisionType(decision.decision);
    const evidenceStock = evidenceUniverse.find((stock) => stock.ticker === decision.symbol.toUpperCase());
    const executionEvidence = decision.decision === "BUY" ? deriveAgExecutionEvidence(evidenceStock) : null;
    const { data: existing, error: existingError } = await supabase
      .from("investment_decisions")
      .select("id, decision_type, transaction_id")
      .eq("portfolio_id", portfolioId)
      .eq("ticker", decision.symbol)
      .eq("source", "ai_committee")
      .eq("status", "active")
      .gte("created_at", era.inception_at)
      .maybeSingle();
    if (existingError) throw new Error(`Unable to check existing AG decision for ${decision.symbol}: ${existingError.message}`);
    if (existing && getAgDecisionLifecycleAction({
      existingActiveDecisionType: existing.decision_type,
      nextDecision: decision.decision,
    }) === "REUSE") {
      persisted.push({
        decisionId: existing.id,
        symbol: decision.symbol,
        decision: fromAgPersistedDecisionType(existing.decision_type),
      });
      continue;
    }

    const { data: row, error } = await supabase
      .from("investment_decisions")
      .insert({
        user_id: user.id,
        portfolio_id: portfolioId,
        transaction_id: null,
        decision_type: decisionType,
        ticker: decision.symbol,
        decision_date: new Date().toISOString(),
        decision_price: null,
        recommended_quantity: null,
        recommended_allocation: null,
        confidence_score: decision.confidence,
        risk_level: null,
        expected_holding_period: decision.thesisClock,
        thesis: decision.ownershipThesis,
        bull_case: decision.strongestEvidence.join("\n"),
        bear_case: decision.strongestCounterEvidence.join("\n"),
        primary_risks: decision.strongestCounterEvidence.join("\n"),
        reassessment_conditions: decision.requiredMonitoring.join("\n"),
        exit_conditions: decision.invalidation.join("\n"),
        ag_thesis_valid: decision.decision === "BUY" && decision.ownershipThesis.trim().length > 0 && decision.invalidation.length > 0,
        ag_liquidity_eligible: executionEvidence?.liquidityEligible ?? null,
        ag_evidence_version: executionEvidence?.evidenceVersion ?? "ag-execution-evidence-v1",
        ag_theme_key: executionEvidence?.themeKey ?? null,
        source: "ai_committee",
        status: "active",
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(`Unable to persist AG decision for ${decision.symbol}: ${error?.message ?? "Unknown error"}`);
    persisted.push({ decisionId: row.id, symbol: decision.symbol, decision: decision.decision });
  }
  return persisted;
}
