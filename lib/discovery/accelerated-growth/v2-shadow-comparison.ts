import { countV2ShadowOutcomes, type V2ShadowOutcome } from "./v2-shadow-outcomes";
/**
 * Read-only comparison of existing AG v1 and research-only v2 screening.
 * No persistence, execution, or mutation of either result.
 */
export type V2ShadowRow = {
  symbol: string;
  v1Status: string;
  v2Status: string;
  v2Path: string;
  v2Reasons: readonly string[];
};
export type V2ShadowSummary = {
  total: number;
  /** Exact string equality only; v1 and v2 status taxonomies differ. */
  agreement: number;
  disagreements: number;
  v2Insufficient: number;
  /** Status labels cannot be treated as semantically equivalent across versions. */
  comparableStatusTaxonomy: false;
  outcomes: Record<V2ShadowOutcome, number>;
  rows: V2ShadowRow[];
  issues: string[];
};
export function summarizeV2Shadow(rows: readonly V2ShadowRow[]): V2ShadowSummary {
  const issues: string[] = [];
  const seen = new Set<string>();
  let agreement = 0;
  let v2Insufficient = 0;
  const copy: V2ShadowRow[] = [];
  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol)) issues.push("SHADOW_INVALID_SYMBOL");
    if (seen.has(symbol)) issues.push("SHADOW_DUPLICATE_SYMBOL:" + symbol);
    seen.add(symbol);
    if (!row.v1Status.trim() || !row.v2Status.trim() || !row.v2Path.trim())
      issues.push("SHADOW_MISSING_STATUS:" + symbol);
    if (row.v1Status === row.v2Status) agreement++;
    if (row.v2Status === "INSUFFICIENT_DATA") v2Insufficient++;
    copy.push({ symbol, v1Status: row.v1Status, v2Status: row.v2Status,
      v2Path: row.v2Path, v2Reasons: [...row.v2Reasons] });
  }
  return {
    total: copy.length, agreement, disagreements: copy.length - agreement,
    v2Insufficient, comparableStatusTaxonomy: false,
    outcomes: countV2ShadowOutcomes(issues.length ? [] : copy),
    rows: issues.length ? [] : copy, issues,
  };
}
