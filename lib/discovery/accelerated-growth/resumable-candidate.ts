import "server-only";
import { createClient } from "@/lib/supabase/server";
import { researchAgCatalyst } from "./catalyst-research";
import { researchAgDeepCandidate, type AgPriorResearchWatch } from "./deep-research";
import type { AgDiscoveryCandidate } from "./discovery";

/**
 * One candidate per request. The caller must have already claimed the
 * catalyst_deep_research parent stage for this cycle. The database RPCs
 * enforce cycle ownership, lease validity, and exactly-once completion.
 * No decisions, watchlist changes, cash changes, or trades occur here.
 */
export async function researchAgCandidateCheckpoint(input: {
  cycleId: string;
  candidate: AgDiscoveryCandidate;
  priorWatch?: AgPriorResearchWatch | null;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("AG_CANDIDATE_AUTHENTICATION_REQUIRED");
  const symbol = input.candidate.symbol.toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_CANDIDATE_INVALID_SYMBOL");
  const { data: cycle, error: cycleError } = await supabase.from("ag_daily_cycles")
    .select("id,portfolio_id").eq("id", input.cycleId)
    .eq("user_id", user.id).eq("status", "running").maybeSingle();
  if (cycleError || !cycle) throw new Error("AG_CANDIDATE_CYCLE_NOT_RUNNING");

  // Idempotent continuation: completed output is authoritative and cannot
  // be recomputed with a second provider request.
  const { data: prior, error: priorError } = await supabase.from("ag_cycle_symbol_checkpoints")
    .select("status,output").eq("cycle_id", input.cycleId)
    .eq("parent_stage", "catalyst_deep_research").eq("symbol", symbol).maybeSingle();
  if (priorError) throw new Error("AG_CANDIDATE_CHECKPOINT_READ_FAILED");
  if (prior?.status === "completed") {
    if (!prior.output || (prior.output as { symbol?: string }).symbol !== symbol)
      throw new Error("AG_CANDIDATE_SAVED_OUTPUT_INVALID");
    return { symbol, reused: true, output: prior.output };
  }
  if (prior && prior.status !== "pending") {
    throw new Error("AG_CANDIDATE_PRIOR_ATTEMPT_REQUIRES_RECONCILIATION");
  }

  const { data: claim, error: claimError } = await supabase.rpc("ag_claim_cycle_symbol", {
    p_cycle_id: input.cycleId,
    p_parent_stage: "catalyst_deep_research",
    p_symbol: symbol,
  });
  const checkpoint = Array.isArray(claim) ? claim[0] : null;
  if (claimError || !checkpoint?.checkpoint_id || !checkpoint?.claim_token)
    throw new Error("AG_CANDIDATE_ATOMIC_CLAIM_FAILED");

  // Do not record a partial candidate as completed after any provider error.
  // A claimed, expired candidate requires explicit reconciliation.
  const catalyst = await researchAgCatalyst(input.candidate);
  const research = catalyst.catalystStatus === "NOT_FOUND"
    ? null
    : await researchAgDeepCandidate(input.candidate, catalyst, input.priorWatch ?? null);
  const output = {
    symbol,
    catalystStatus: catalyst.catalystStatus,
    research,
    completedAt: new Date().toISOString(),
  };
  const { data: completed, error: completionError } = await supabase.rpc("ag_complete_cycle_symbol", {
    p_checkpoint_id: checkpoint.checkpoint_id,
    p_claim_token: checkpoint.claim_token,
    p_output: output,
  });
  if (completionError || completed !== true)
    throw new Error("AG_CANDIDATE_COMPLETION_NOT_CONFIRMED_RECONCILIATION_REQUIRED");
  return { symbol, reused: false, output };
}
