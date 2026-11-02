import "server-only";
import { createClient } from "@/lib/supabase/server";
import { runAgV2Committee, AG_V2_COMMITTEE_VERSION, type AgV2CommitteeResult } from "./opportunity-committee";
import type { AgOpportunityDeepResearch } from "./opportunity-deep-research";

type State = {
  version: string; symbols: string[]; cursor: number;
  rankedQualifiedCandidates: { symbol: string }[];
  deepCursor: number; deepResults: AgOpportunityDeepResearch[];
  committeeCursor?: number; committeeResults?: AgV2CommitteeResult[];
};
/** One saved, versioned Committee decision per request. No reuse of historical decisions. */
export async function processAgV2CommitteeStep(scanRunId: string) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("AG_V2_COMMITTEE_AUTH_REQUIRED");
  const { data: scan, error } = await db.from("discovery_scan_runs")
    .select("id,portfolio_type,scoring_version,status,stage,state")
    .eq("id", scanRunId).eq("user_id", user.id).maybeSingle();
  if (error || !scan || scan.portfolio_type !== "paper_active" ||
      scan.scoring_version !== "ag-opportunity-v2") throw new Error("AG_V2_COMMITTEE_SCAN_UNAVAILABLE");
  if (scan.status !== "completed" || !["ag_v2_deep_complete","ag_v2_committee_complete"].includes(scan.stage))
    throw new Error("AG_V2_COMMITTEE_REQUIRES_RECONCILIATION");
  const state = scan.state as State | null;
  if (!state || state.version !== "ag-opportunity-v2" ||
      !Array.isArray(state.symbols) || state.symbols.length !== 5 ||
      state.cursor !== 5 || !Array.isArray(state.rankedQualifiedCandidates) ||
      !Array.isArray(state.deepResults) ||
      state.deepCursor !== state.deepResults.length ||
      state.deepResults.length !== state.rankedQualifiedCandidates.length ||
      state.deepResults.some((r,i) => r.symbol !== state.rankedQualifiedCandidates[i]?.symbol ||
        r.opportunityVersion !== "ag-opportunity-v2" || r.promptVersion !== "ag-opportunity-deep-v1"))
    throw new Error("AG_V2_COMMITTEE_INVALID_SAVED_RESEARCH");
  const cursor = state.committeeCursor ?? 0;
  const results = state.committeeResults ?? [];
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > state.deepResults.length ||
      !Array.isArray(results) || results.length !== cursor ||
      results.some((r,i) => r.symbol !== state.deepResults[i].symbol ||
        ![AG_V2_COMMITTEE_VERSION, "ag-opportunity-committee-v1"].includes(r.promptVersion) ||
        !["BUY","WATCH","REJECT"].includes(r.decision)))
    throw new Error("AG_V2_COMMITTEE_INVALID_SAVED_DECISIONS");
  // A started v1 Committee run cannot silently switch to the new v2 prompt.
  // Completed v1 runs remain readable and auditable without modification.
  if (cursor > 0 && cursor < state.deepResults.length && scan.stage !== "ag_v2_committee_complete" &&
      results.some(r => r.promptVersion !== AG_V2_COMMITTEE_VERSION))
    throw new Error("AG_V2_COMMITTEE_VERSION_CHANGE_REQUIRES_NEW_SCAN");
  if (scan.stage === "ag_v2_committee_complete") {
    if (cursor !== state.deepResults.length) throw new Error("AG_V2_COMMITTEE_INCOMPLETE_FINAL_STATE");
    return { scanRunId, completed: cursor, total: state.deepResults.length, status: "completed" as const };
  }
  if (cursor === state.deepResults.length) {
    const { data, error: saveError } = await db.from("discovery_scan_runs")
      .update({ stage: "ag_v2_committee_complete" })
      .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
      .eq("stage", "ag_v2_deep_complete").select("id").maybeSingle();
    if (saveError || !data) throw new Error("AG_V2_COMMITTEE_FINALIZE_UNCONFIRMED");
    return { scanRunId, completed: cursor, total: cursor, status: "completed" as const };
  }
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_v2_committee_claimed" })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
    .eq("stage", "ag_v2_deep_complete").select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("AG_V2_COMMITTEE_ALREADY_CLAIMED");
  const decision = await runAgV2Committee(state.deepResults[cursor]);
  if (decision.symbol !== state.deepResults[cursor].symbol || decision.promptVersion !== AG_V2_COMMITTEE_VERSION)
    throw new Error("AG_V2_COMMITTEE_RESULT_MISMATCH");
  const next = { ...state, committeeCursor: cursor + 1, committeeResults: [...results, decision] };
  const { data: saved, error: saveError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_v2_deep_complete", state: next })
    .eq("id", scanRunId).eq("user_id", user.id).eq("status", "completed")
    .eq("stage", "ag_v2_committee_claimed").select("id").maybeSingle();
  if (saveError || !saved) throw new Error("AG_V2_COMMITTEE_PERSISTENCE_UNCONFIRMED");
  return { scanRunId, completed: next.committeeCursor, total: state.deepResults.length, status: "running" as const };
}
