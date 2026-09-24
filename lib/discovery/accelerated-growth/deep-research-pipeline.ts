import { runAcceleratedGrowthDiscovery } from "./discovery";
import { researchAgCatalyst } from "./catalyst-research";
import { researchAgDeepCandidate, type AgDeepResearch, type AgPriorResearchWatch } from "./deep-research";
import { createClient } from "@/lib/supabase/server";

export type AgQuantitativeWatchResolution = {
  symbol: string;
  resolution: "REVIEW" | "REJECT" | "INSUFFICIENT_DATA";
};

export type AgDeepResearchPipelineResult = {
  discovery: { universeCount: number; preselectedCount: number; evaluatedCount: number; advanceCount: number; rateLimited: boolean; stoppedEarly: boolean };
  catalystSupportedCount: number; requestedCount: number; completedCount: number; failedCount: number;
  results: AgDeepResearch[];
  quantitativeWatchResolutions: AgQuantitativeWatchResolution[];
  errors: Array<{ symbol: string; stage: "CATALYST" | "DEEP_RESEARCH" | "DISCOVERY"; error: string }>;
};

export async function runAgDeepResearchPipeline(options?: { maxCandidates?: number }): Promise<AgDeepResearchPipelineResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const priorWatchByTicker = new Map<string, AgPriorResearchWatch>();

  // Load unresolved watches before Discovery so they remain eligible for
  // reassessment even when they do not win today's zero-call selector.
  if (user) {
    const { data: portfolio } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").maybeSingle();
    if (portfolio) {
      const { data: era } = await supabase.from("portfolio_strategy_eras")
        .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
        .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).maybeSingle();
      if (era) {
        const { data: watches, error: watchError } = await supabase.from("ag_research_watchlist")
          .select("ticker, confidence, thesis, unresolved_questions, thesis_clock, first_seen_at, last_seen_at")
          .eq("portfolio_id", portfolio.id).eq("strategy_era_id", era.id).is("resolved_at", null)
          .order("last_seen_at", { ascending: true }).limit(5);
        if (watchError) throw new Error(`Unable to load prior AG research watches: ${watchError.message}`);
        for (const watch of watches ?? []) {
          priorWatchByTicker.set(watch.ticker.toUpperCase(), {
            confidence: Number(watch.confidence), thesis: watch.thesis,
            unresolvedQuestions: watch.unresolved_questions ?? [], thesisClock: watch.thesis_clock,
            firstSeenAt: watch.first_seen_at, lastSeenAt: watch.last_seen_at,
          });
        }
      }
    }
  }

  const discovery = await runAcceleratedGrowthDiscovery({ reassessSymbols: Array.from(priorWatchByTicker.keys()) });
  const discoverySummary = {
    universeCount: discovery.universeCount, preselectedCount: discovery.preselectedCount,
    evaluatedCount: discovery.evaluatedCount, advanceCount: discovery.advanceCount,
    rateLimited: discovery.rateLimited, stoppedEarly: discovery.stoppedEarly,
  };
  if (discovery.rateLimited || discovery.stoppedEarly) {
    return { discovery: discoverySummary, catalystSupportedCount: 0, requestedCount: 0, completedCount: 0, failedCount: 0, results: [], quantitativeWatchResolutions: [], errors: [{ symbol: "DISCOVERY", stage: "DISCOVERY", error: "Deep research skipped because AG Discovery did not complete cleanly." }] };
  }

  const quantitativeWatchResolutions: AgQuantitativeWatchResolution[] = discovery.candidates
    .filter((candidate) => priorWatchByTicker.has(candidate.symbol.toUpperCase()) && candidate.score.status !== "ADVANCE")
    .map((candidate) => ({
      symbol: candidate.symbol,
      resolution: candidate.score.status as AgQuantitativeWatchResolution["resolution"],
    }));

  const maxCandidates = Math.max(1, Math.min(options?.maxCandidates ?? 5, 5));
  const advance = discovery.candidates.filter((candidate) => candidate.score.status === "ADVANCE");
  const watchedAdvance = advance.filter((candidate) => priorWatchByTicker.has(candidate.symbol.toUpperCase()));
  const newAdvance = advance.filter((candidate) => !priorWatchByTicker.has(candidate.symbol.toUpperCase()));

  // Reassess unresolved WATCHes first, then use remaining scarce research slots
  // for today's strongest new candidates. This guarantees continuity without
  // increasing the maximum five deep-research calls per cycle.
  const selected = [
    ...watchedAdvance.sort((a, b) => {
      const aWatch = priorWatchByTicker.get(a.symbol.toUpperCase());
      const bWatch = priorWatchByTicker.get(b.symbol.toUpperCase());
      return new Date(aWatch?.lastSeenAt ?? 0).getTime() - new Date(bWatch?.lastSeenAt ?? 0).getTime();
    }),
    ...newAdvance.sort((a, b) => b.score.total - a.score.total),
  ].slice(0, maxCandidates);

  const results: AgDeepResearch[] = [];
  const errors: AgDeepResearchPipelineResult["errors"] = [];
  let catalystSupportedCount = 0;
  for (const candidate of selected) {
    try {
      const catalyst = await researchAgCatalyst(candidate);
      if (catalyst.catalystStatus === "NOT_FOUND") continue;
      catalystSupportedCount += 1;
      try {
        results.push(await researchAgDeepCandidate(candidate, catalyst, priorWatchByTicker.get(candidate.symbol.toUpperCase()) ?? null));
      } catch (error) {
        errors.push({ symbol: candidate.symbol, stage: "DEEP_RESEARCH", error: error instanceof Error ? error.message : "Unknown AG deep research error." });
      }
    } catch (error) {
      errors.push({ symbol: candidate.symbol, stage: "CATALYST", error: error instanceof Error ? error.message : "Unknown AG catalyst research error." });
    }
  }

  return { discovery: discoverySummary, catalystSupportedCount, requestedCount: selected.length, completedCount: results.length, failedCount: errors.length, results, quantitativeWatchResolutions, errors };
}
