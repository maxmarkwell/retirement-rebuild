import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AgCommittedLedgerRow } from "./atomic-persistence-adapter";

/** Read-only implementation of the isolated ledger verification boundary.
 * Requires the proposed ledger migration to be approved and deployed before use.
 * Deliberately not imported by the active AG daily-cycle runner.
 */
export async function selectAgCommittedLedgerRows(query: {
  cycleId: string;
  userId: string;
  portfolioId: string;
  strategyEraId: string;
}): Promise<readonly AgCommittedLedgerRow[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id.toLowerCase() !== query.userId.toLowerCase()) {
    throw new Error("AG ledger verification requires the authenticated cycle owner.");
  }
  const { data, error } = await supabase
    .from("ag_cycle_decision_writes")
    .select("cycle_id,ticker,status,investment_decision_id,payload_hash,decision_kind,user_id,portfolio_id,strategy_era_id")
    .eq("cycle_id", query.cycleId)
    .eq("user_id", query.userId)
    .eq("portfolio_id", query.portfolioId)
    .eq("strategy_era_id", query.strategyEraId);
  if (error || !data) throw new Error("Unable to verify AG committed decision ledger.");
  return data as AgCommittedLedgerRow[];
}
