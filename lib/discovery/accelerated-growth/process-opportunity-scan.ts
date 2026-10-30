import "server-only";
import { createClient } from "@/lib/supabase/server";
import { researchAgOpportunityDiscoveryStep } from "./opportunity-discovery-step";
import { rankAgOpportunityResearch } from "./rank-opportunity-research";

const VERSION = "ag-opportunity-v2";
type ResearchResult = Awaited<ReturnType<typeof researchAgOpportunityDiscoveryStep>>;
type State = {
  version: typeof VERSION;
  symbols: string[];
  cursor: number;
  results: ResearchResult[];
};
const validSymbol = (s: string) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);

/**
 * Continue exactly one candidate of an already initialized AG Discovery v2
 * scan. Reuses Real Portfolio's discovery_scan_runs state/cursor persistence.
 *
 * No automatic recovery of a claimed provider call: if interrupted, the
 * 'ag_v2_claimed' stage remains for explicit reconciliation. This is safer
 * than paying twice or silently accepting inconsistent results.
 *
 * The scan must have been created by a separate authorized coordinator with
 * scoring_version = ag-opportunity-v2, portfolio_type = paper_active,
 * stage = ag_v2_ready, and an immutable ordered state.symbols manifest.
 */
export async function processAgOpportunityScanStep(scanRunId: string) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("AG_V2_AUTH_REQUIRED");
  const { data: scan, error } = await db.from("discovery_scan_runs")
    .select("id,user_id,portfolio_type,scoring_version,status,stage,state")
    .eq("id", scanRunId).eq("user_id", user.id).maybeSingle();
  if (error || !scan || scan.portfolio_type !== "paper_active" ||
      scan.scoring_version !== VERSION) throw new Error("AG_V2_SCAN_UNAVAILABLE");
  if (scan.status === "completed" && scan.stage === "ag_v2_complete") {
    return { scanRunId, status: "completed" as const };
  }
  if (scan.status !== "running" || scan.stage !== "ag_v2_ready") {
    throw new Error("AG_V2_SCAN_REQUIRES_RECONCILIATION");
  }
  const state = scan.state as State | null;
  if (!state || state.version !== VERSION || !Array.isArray(state.symbols) ||
      !Array.isArray(state.results) || !Number.isInteger(state.cursor) ||
      state.cursor < 0 || state.cursor > state.symbols.length ||
      state.symbols.length < 1 || state.symbols.length > 5 ||
      state.symbols.some(s => typeof s !== "string" || !validSymbol(s)) ||
      new Set(state.symbols).size !== state.symbols.length ||
      state.results.length !== state.cursor ||
      state.results.some((r, i) => r.symbol !== state.symbols[i] || r.version !== "ag-opportunity-research-v1")) {
    throw new Error("AG_V2_INVALID_SAVED_MANIFEST");
  }
  if (state.cursor === state.symbols.length) {
    const ranked = rankAgOpportunityResearch(state.results);
    const { data: done, error: finishError } = await db.from("discovery_scan_runs")
      .update({
        status: "completed", stage: "ag_v2_complete", completed_at: new Date().toISOString(),
        state: { ...state, rankedQualifiedCandidates: ranked },
        completed_count: state.results.length,
        deep_candidate_count: ranked.length,
      })
      .eq("id", scanRunId).eq("user_id", user.id).eq("status", "running").eq("stage", "ag_v2_ready")
      .select("id").maybeSingle();
    if (finishError || !done) throw new Error("AG_V2_FINALIZATION_UNCONFIRMED");
    return { scanRunId, status: "completed" as const };
  }
  // Atomic stage transition before starting any external research call.
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_v2_claimed" })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "running")
    .eq("stage", "ag_v2_ready").eq("state", scan.state)
    .select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("AG_V2_ALREADY_CLAIMED");
  const symbol = state.symbols[state.cursor];
  const result = await researchAgOpportunityDiscoveryStep({ symbol });
  if (result.symbol !== symbol) throw new Error("AG_V2_RESULT_SYMBOL_MISMATCH");
  const next: State = { ...state, cursor: state.cursor + 1, results: [...state.results, result] };
  const { data: saved, error: saveError } = await db.from("discovery_scan_runs")
    .update({ state: next, stage: "ag_v2_ready" })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "running")
    .eq("stage", "ag_v2_claimed").eq("state", scan.state)
    .select("id").maybeSingle();
  if (saveError || !saved) throw new Error("AG_V2_RESULT_PERSISTENCE_UNCONFIRMED");
  return { scanRunId, status: "running" as const, processedSymbol: symbol,
    completed: next.cursor, total: next.symbols.length };
}
