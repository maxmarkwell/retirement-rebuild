import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AgDeepResearch } from "./deep-research";
import { assertAgCandidateCheckpointManifest } from "./candidate-selection";

export type AgSavedCandidateOutcome = {
  symbol: string;
  catalystStatus: string;
  research: AgDeepResearch | null;
};

/**
 * Strict read-only manifest check before downstream Committee research.
 * A missing, duplicate, in-flight, mismatched or extra symbol prevents
 * continuation; nothing is silently retried or discarded.
 */
export async function loadCompletedAgCandidateOutcomes(input: {
  cycleId: string;
  expectedSymbols: string[];
}): Promise<AgSavedCandidateOutcome[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("AG_CANDIDATE_MANIFEST_AUTH_REQUIRED");
  const expected = input.expectedSymbols.map(s => s.toUpperCase());
  if (expected.length > 5 || new Set(expected).size !== expected.length ||
      expected.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s))) {
    throw new Error("AG_CANDIDATE_MANIFEST_INVALID");
  }
  const { data: cycle, error: cycleError } = await supabase.from("ag_daily_cycles")
    .select("id,portfolio_id,max_candidates").eq("id",input.cycleId)
    .eq("user_id",user.id).eq("status","running").maybeSingle();
  if (cycleError || !cycle) throw new Error("AG_CANDIDATE_MANIFEST_CYCLE_NOT_RUNNING");
  if (expected.length > Number(cycle.max_candidates)) throw new Error("AG_CANDIDATE_MANIFEST_EXCEEDS_CYCLE_LIMIT");

  const { data: stage, error: stageError } = await supabase.from("ag_cycle_stage_checkpoints")
    .select("id,status").eq("cycle_id",input.cycleId)
    .eq("stage","catalyst_deep_research").maybeSingle();
  if (stageError || !stage || !["running","completed"].includes(stage.status)) {
    throw new Error("AG_CANDIDATE_PARENT_STAGE_UNAVAILABLE");
  }
  const { data: rows, error } = await supabase.from("ag_cycle_symbol_checkpoints")
    .select("symbol,status,output").eq("cycle_id",input.cycleId)
    .eq("parent_stage","catalyst_deep_research");
  if (error || !rows) throw new Error("AG_CANDIDATE_MANIFEST_READ_FAILED");
  assertAgCandidateCheckpointManifest({ expectedSymbols: expected, checkpoints: rows });
  const bySymbol = new Map(rows.map(row => [row.symbol, row]));
  if (rows.length !== expected.length || bySymbol.size !== rows.length ||
      expected.some(symbol => !bySymbol.has(symbol))) {
    throw new Error("AG_CANDIDATE_MANIFEST_MISMATCH");
  }
  return expected.map(symbol => {
    const row = bySymbol.get(symbol)!;
    if (row.status !== "completed" || !row.output || typeof row.output !== "object") {
      throw new Error("AG_CANDIDATE_MANIFEST_INCOMPLETE");
    }
    const output = row.output as { symbol?: unknown; catalystStatus?: unknown; research?: unknown };
    if (output.symbol !== symbol ||
        !["NOT_FOUND","SUPPORTED","MIXED"].includes(String(output.catalystStatus)) ||
        (output.catalystStatus === "NOT_FOUND" && output.research !== null) ||
        (output.catalystStatus !== "NOT_FOUND" && (!output.research || typeof output.research !== "object" ||
          (output.research as { symbol?: unknown }).symbol !== symbol))) {
      throw new Error("AG_CANDIDATE_MANIFEST_INVALID_OUTPUT");
    }
    return { symbol, catalystStatus: String(output.catalystStatus), research: output.research as AgDeepResearch | null };
  });
}
