import { runAcceleratedGrowthDiscovery } from "./discovery";
import { researchAgCatalyst } from "./catalyst-research";
import { researchAgDeepCandidate, type AgDeepResearch, type AgPriorResearchWatch } from "./deep-research";
import { createClient } from "@/lib/supabase/server";

export type AgDeepResearchPipelineResult = {
  discovery: {
    universeCount: number;
    preselectedCount: number;
    evaluatedCount: number;
    advanceCount: number;
    rateLimited: boolean;
    stoppedEarly: boolean;
  };
  catalystSupportedCount: number;
  requestedCount: number;
  completedCount: number;
  failedCount: number;
  results: AgDeepResearch[];
  errors: Array<{ symbol: string; stage: "CATALYST" | "DEEP_RESEARCH" | "DISCOVERY"; error: string }>;
};

export async function runAgDeepResearchPipeline(options?: { maxCandidates?: number }): Promise<AgDeepResearchPipelineResult> {
  const discovery = await runAcceleratedGrowthDiscovery();
  const discoverySummary = {
    universeCount: discovery.universeCount,
    preselectedCount: discovery.preselectedCount,
    evaluatedCount: discovery.evaluatedCount,
    advanceCount: discovery.advanceCount,
    rateLimited: discovery.rateLimited,
    stoppedEarly: discovery.stoppedEarly,
  };

  if (discovery.rateLimited || discovery.stoppedEarly) {
    return {
      discovery: discoverySummary,
      catalystSupportedCount: 0,
      requestedCount: 0,
      completedCount: 0,
      failedCount: 0,
      results: [],
      errors: [{ symbol: "DISCOVERY", stage: "DISCOVERY", error: "Deep research skipped because AG Discovery did not complete cleanly." }],
    };
  }

  const maxCandidates = Math.max(1, Math.min(options?.maxCandidates ?? 5, 5));
  const advance = discovery.candidates
    .filter((candidate) => candidate.score.status === "ADVANCE")
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, maxCandidates);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const symbols = advance.map((candidate) => candidate.symbol.toUpperCase());
  const priorWatchByTicker = new Map<string, AgPriorResearchWatch>();

  if (user && symbols.length > 0) {
    const { data: portfolio } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").maybeSingle();
    if (portfolio) {
      const { data: era } = await supabase.from("portfolio_strategy_eras")
        .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
        .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).maybeSingle();
      if (era) {
        const { data: watches, error: watchError } = await supabase.from("ag_research_watchlist")
          .select("ticker, confidence, thesis, unresolved_questions, thesis_clock, first_seen_at, last_seen_at")
          .eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).is("resolved_at", null).in("ticker", symbols);
        if (watchError) throw new Error(`Unable to load prior AG research watches: ${watchError.message}`);
        for (const watch of watches ?? []) {
          priorWatchByTicker.set(watch.ticker.toUpperCase(), {
            confidence: Number(watch.confidence),
            thesis: watch.thesis,
            unresolvedQuestions: watch.unresolved_questions ?? [],
            thesisClock: watch.thesis_clock,
            firstSeenAt: watch.first_seen_at,
            lastSeenAt: watch.last_seen_at,
          });
        }
      }
    }
  }

  const results: AgDeepResearch[] = [];
  const errors: AgDeepResearchPipelineResult["errors"] = [];
  let catalystSupportedCount = 0;

  // Intentionally sequential. This is a scarce, high-cost challenge stage.
  for (const candidate of advance) {
    try {
      const catalyst = await researchAgCatalyst(candidate);
      if (catalyst.catalystStatus === "NOT_FOUND") continue;
      catalystSupportedCount += 1;

      try {
        results.push(await researchAgDeepCandidate(candidate, catalyst, priorWatchByTicker.get(candidate.symbol.toUpperCase()) ?? null));
      } catch (error) {
        errors.push({
          symbol: candidate.symbol,
          stage: "DEEP_RESEARCH",
          error: error instanceof Error ? error.message : "Unknown AG deep research error.",
        });
      }
    } catch (error) {
      errors.push({
        symbol: candidate.symbol,
        stage: "CATALYST",
        error: error instanceof Error ? error.message : "Unknown AG catalyst research error.",
      });
    }
  }

  return {
    discovery: discoverySummary,
    catalystSupportedCount,
    requestedCount: advance.length,
    completedCount: results.length,
    failedCount: errors.length,
    results,
    errors,
  };
}
