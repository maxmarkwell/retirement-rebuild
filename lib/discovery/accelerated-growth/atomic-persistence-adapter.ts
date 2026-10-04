/** Isolated application-side adapter for the draft per-decision RPC.
 * NOT connected to the AG daily-cycle runner. Requires approved live schema
 * and a separately verified persistence-stage claim before use.
 */
import { planAgDecisionWrites, type AgDecisionWrite } from "./atomic-persistence-contract";

export type AgRpcDecisionPayload = {
  thesis: string;
  confidence: number;
  thesisClock: string;
  bullCase?: string | null;
  bearCase?: string | null;
  monitoring?: string | null;
  invalidation?: string | null;
  notes?: string | null;
  agThesisValid?: boolean | null;
  agLiquidityEligible?: boolean | null;
  agEvidenceVersion?: string | null;
  agThemeKey?: string | null;
};
export type AgRpcCall = {
  p_cycle_id: string; p_claim_token: string; p_ticker: string;
  p_kind: "holding_review" | "committee"; p_decision_type: string;
  p_thesis: string; p_confidence: number; p_thesis_clock: string;
  p_bull_case: string | null; p_bear_case: string | null;
  p_monitoring: string | null; p_invalidation: string | null;
  p_notes: string | null; p_ag_thesis_valid: boolean | null;
  p_ag_liquidity_eligible: boolean | null; p_ag_evidence_version: string | null;
  p_ag_theme_key: string | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nullableString = (value: unknown, field: string): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`Invalid AG ${field}`);
  return value;
};
const nullableBoolean = (value: unknown, field: string): boolean | null => {
  if (value == null) return null;
  if (typeof value !== "boolean") throw new Error(`Invalid AG ${field}`);
  return value;
};
export function prepareAgRpcBatch(
  writes: readonly AgDecisionWrite[], claimToken: string,
): readonly AgRpcCall[] {
  if (!UUID.test(claimToken)) throw new Error("Valid AG stage claim token required.");
  return planAgDecisionWrites(writes).map((write) => {
    const p = write.payload;
    if (typeof p.thesis !== "string" || !p.thesis.trim() ||
      typeof p.confidence !== "number" || !Number.isFinite(p.confidence) ||
      p.confidence < 0 || p.confidence > 100 ||
      typeof p.thesisClock !== "string" || !p.thesisClock.trim()) {
      throw new Error(`Invalid AG decision payload for ${write.symbol}`);
    }
    return {
      p_cycle_id: write.cycleId, p_claim_token: claimToken, p_ticker: write.symbol,
      p_kind: write.kind, p_decision_type: write.decisionType,
      p_thesis: p.thesis, p_confidence: p.confidence, p_thesis_clock: p.thesisClock,
      p_bull_case: nullableString(p.bullCase, "bullCase"),
      p_bear_case: nullableString(p.bearCase, "bearCase"),
      p_monitoring: nullableString(p.monitoring, "monitoring"),
      p_invalidation: nullableString(p.invalidation, "invalidation"),
      p_notes: nullableString(p.notes, "notes"),
      p_ag_thesis_valid: nullableBoolean(p.agThesisValid, "agThesisValid"),
      p_ag_liquidity_eligible: nullableBoolean(p.agLiquidityEligible, "agLiquidityEligible"),
      p_ag_evidence_version: nullableString(p.agEvidenceVersion, "agEvidenceVersion"),
      p_ag_theme_key: nullableString(p.agThemeKey, "agThemeKey"),
    };
  });
}
/** Never infer success from an RPC timeout. The caller must verify the
 * committed ledger before claiming stage completion or attempting recovery.
 * Prevalidate the ENTIRE batch before issuing its first write.
 */
export async function commitPreparedAgBatch(
  calls: readonly AgRpcCall[],
  invoke: (args: AgRpcCall) => Promise<string>,
): Promise<readonly string[]> {
  // Defense in depth: reject forged or mutated prepared calls before the first RPC.
  // Callers must not pass arbitrary objects as a prevalidated batch.
  if (!Array.isArray(calls)) throw new Error("Invalid prepared AG batch.");
  const seen = new Set<string>();
  for (const call of calls) {
    if (!call || !UUID.test(call.p_cycle_id) || !UUID.test(call.p_claim_token) ||
      typeof call.p_ticker !== "string" || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(call.p_ticker) ||
      !["holding_review", "committee"].includes(call.p_kind) ||
      !["buy", "hold", "sell", "watch", "avoid"].includes(call.p_decision_type) ||
      (call.p_kind === "committee" && !["buy", "watch", "avoid"].includes(call.p_decision_type)) ||
      (call.p_kind === "holding_review" && !["hold", "sell"].includes(call.p_decision_type)) ||
      typeof call.p_thesis !== "string" || !call.p_thesis.trim() ||
      typeof call.p_confidence !== "number" || !Number.isFinite(call.p_confidence) ||
      call.p_confidence < 0 || call.p_confidence > 100 ||
      typeof call.p_thesis_clock !== "string" || !call.p_thesis_clock.trim()) {
      throw new Error("Invalid prepared AG RPC arguments.");
    }
    const key = `${call.p_cycle_id.toLowerCase()}:${call.p_ticker}`;
    if (seen.has(key)) throw new Error("Duplicate prepared AG RPC ticker.");
    seen.add(key);
  }
  const ids: string[] = [];
  for (const call of calls) {
    const id = await invoke(call);
    if (!UUID.test(id)) throw new Error("AG RPC returned an invalid decision ID; reconcile ledger.");
    ids.push(id);
  }
  return ids;
}
