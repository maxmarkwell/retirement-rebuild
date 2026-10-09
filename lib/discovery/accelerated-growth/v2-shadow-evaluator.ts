import { summarizeV2Shadow, type V2ShadowRow, type V2ShadowSummary } from "./v2-shadow-comparison";
import type { V2ResearchGateResult } from "./v2-research-gate";

/**
 * Pure shadow evaluation: caller supplies already-computed v1 snapshots and
 * v2 research-gate outputs. No database access, network, transactions or
 * persistence. The comparison is informational, never a trade decision.
 */
export type V2ShadowInput = {
  symbol: string;
  v1Status: string;
  v2Path: string;
  v2Gate: V2ResearchGateResult | null;
};

export function evaluateV2ShadowSnapshots(input: readonly V2ShadowInput[]): V2ShadowSummary {
  const rows: V2ShadowRow[] = input.map(item => ({
    symbol: item.symbol,
    v1Status: item.v1Status,
    v2Path: item.v2Path,
    v2Status: item.v2Gate?.status === "ELIGIBLE" && !item.v2Gate.eligible
      ? "INSUFFICIENT_DATA" : item.v2Gate?.status ?? "INSUFFICIENT_DATA",
    v2Reasons: item.v2Gate?.status === "ELIGIBLE" && !item.v2Gate.eligible
      ? ["SHADOW_INCONSISTENT_GATE_ELIGIBILITY"] :
      item.v2Gate?.reasons ?? ["SHADOW_MISSING_V2_GATE"],
  }));
  return summarizeV2Shadow(rows);
}
