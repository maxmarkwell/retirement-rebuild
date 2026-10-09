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
  const { data, error } = await supabase.rpc("ag_read_cycle_decision_ledger", {
    p_cycle_id: query.cycleId,
  });
  if (error || !data) throw new Error("Unable to verify AG committed decision ledger.");
  const rows = data as AgCommittedLedgerRow[];
  if (rows.some((row) =>
    row.user_id?.toLowerCase() !== query.userId.toLowerCase() ||
    row.portfolio_id?.toLowerCase() !== query.portfolioId.toLowerCase() ||
    row.strategy_era_id?.toLowerCase() !== query.strategyEraId.toLowerCase())) {
    throw new Error("AG decision ledger scope mismatch.");
  }
  return rows;
}
