import "server-only";
import { createClient } from "@/lib/supabase/server";
import { researchQualifiedAgOpportunity } from "./opportunity-deep-research";
import { rankAgOpportunityResearch } from "./rank-opportunity-research";

const VERSION = "ag-opportunity-v2";
type DeepResult = Awaited<ReturnType<typeof researchQualifiedAgOpportunity>>;
type SavedDiscovery = {
  symbol: string;
  version: "ag-opportunity-research-v1";
  qualification: Parameters<typeof researchQualifiedAgOpportunity>[0];
};
type State = {
  version: string;
  symbols: string[];
  cursor: number;
  results: SavedDiscovery[];
  rankedQualifiedCandidates: { symbol: string; researchPriority: number }[];
  deepCursor?: number;
  deepResults?: DeepResult[];
};

/** One independent deep-research call using a completed, owner-scoped AG v2 discovery scan.
 * A claimed/incomplete provider call requires explicit reconciliation, never silent replay.
 */
export async function processAgOpportunityDeepStep(scanRunId: string) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("AG_V2_DEEP_AUTH_REQUIRED");
  const { data: scan, error } = await db.from("discovery_scan_runs")
    .select("id,user_id,portfolio_type,scoring_version,status,stage,state")
    .eq("id", scanRunId).eq("user_id", user.id).maybeSingle();
  if (error || !scan || scan.portfolio_type !== "paper_active" ||
      scan.scoring_version !== VERSION) throw new Error("AG_V2_DEEP_SCAN_UNAVAILABLE");
  if (scan.status !== "completed" ||
      !["ag_v2_complete","ag_v2_deep_complete"].includes(scan.stage)) {
    throw new Error("AG_V2_DEEP_REQUIRES_RECONCILIATION");
  }
  if (scan.stage === "ag_v2_deep_complete") {
    return { scanRunId, status: "completed" as const };
  }
  const state = scan.state as State | null;
  if (!state || state.version !== VERSION || !Array.isArray(state.symbols) ||
      !Array.isArray(state.results) || !Array.isArray(state.rankedQualifiedCandidates) ||
      state.cursor !== state.symbols.length || state.results.length !== state.symbols.length ||
      state.symbols.length < 1 || state.symbols.length > 5 ||
      state.symbols.some((s,i) => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s) ||
        state.symbols.indexOf(s) !== i || state.results[i]?.symbol !== s ||
        state.results[i]?.version !== "ag-opportunity-research-v1")) {
    throw new Error("AG_V2_DEEP_INVALID_DISCOVERY_MANIFEST");
  }
  const expectedRanking = rankAgOpportunityResearch(state.results);
  if (JSON.stringify(state.rankedQualifiedCandidates) !== JSON.stringify(expectedRanking)) {
    throw new Error("AG_V2_DEEP_RANKING_MISMATCH");
  }
  const deepCursor = state.deepCursor ?? 0;
  const deepResults = state.deepResults ?? [];
  if (!Number.isInteger(deepCursor) || deepCursor < 0 ||
      deepCursor > expectedRanking.length || deepResults.length !== deepCursor ||
      deepResults.some((r,i) => r.symbol !== expectedRanking[i]?.symbol ||
        r.opportunityVersion !== VERSION || r.promptVersion !== "ag-opportunity-deep-v1")) {
    throw new Error("AG_V2_DEEP_INVALID_SAVED_RESULTS");
  }
  if (deepCursor === expectedRanking.length) {
    const { data: done, error: finishError } = await db.from("discovery_scan_runs")
      .update({ stage: "ag_v2_deep_complete", state: { ...state, deepCursor, deepResults } })
      .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
      .eq("stage", "ag_v2_complete").eq("state", scan.state)
      .select("id").maybeSingle();
    if (finishError || !done) throw new Error("AG_V2_DEEP_FINALIZE_UNCONFIRMED");
    return { scanRunId, status: "completed" as const, deepResearched: deepCursor };
  }
  // Claim before invoking the model. Failed or timed-out calls must not be
  // repeated automatically, because the provider result may be uncertain.
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_v2_deep_claimed" })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
    .eq("stage", "ag_v2_complete").eq("state", scan.state)
    .select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("AG_V2_DEEP_ALREADY_CLAIMED");
  const symbol = expectedRanking[deepCursor].symbol;
  const discovery = state.results.find(r => r.symbol === symbol);
  if (!discovery) throw new Error("AG_V2_DEEP_QUALIFICATION_MISSING");
  const result = await researchQualifiedAgOpportunity(discovery.qualification);
  if (result.symbol !== symbol || result.opportunityVersion !== VERSION) {
    throw new Error("AG_V2_DEEP_RESULT_MISMATCH");
  }
  const next = { ...state, deepCursor: deepCursor + 1, deepResults: [...deepResults, result] };
  const { data: saved, error: saveError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_v2_complete", state: next })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
    .eq("stage", "ag_v2_deep_claimed").eq("state", scan.state)
    .select("id").maybeSingle();
  if (saveError || !saved) throw new Error("AG_V2_DEEP_SAVE_UNCONFIRMED");
  return { scanRunId, status: "running" as const,
    processedSymbol: symbol, deepResearched: next.deepCursor,
    total: expectedRanking.length };
}
