/**
 * Version-aware comparison of screening outcomes. This is NOT a comparison
 * of BUY decisions, expected returns, or portfolio eligibility.
 *
 * V1 ADVANCE/REVIEW/REJECT/INSUFFICIENT and v2 research gate
 * ELIGIBLE/RISK_REVIEW/NOT_QUALIFIED/INSUFFICIENT_DATA are different stages.
 * Preserve raw statuses; use explicit descriptive buckets only.
 */
export type V2ShadowOutcome =
  | "BOTH_POSITIVE"
  | "V1_POSITIVE_V2_NEGATIVE"
  | "V1_NEGATIVE_V2_POSITIVE"
  | "BOTH_NEGATIVE"
  | "V2_EVIDENCE_GAP"
  | "V1_EVIDENCE_GAP"
  | "BOTH_EVIDENCE_GAP"
  | "UNMAPPED";

export function classifyV2ShadowOutcome(v1: string, v2: string): V2ShadowOutcome {
  const v1Gap = v1 === "INSUFFICIENT" || v1 === "INSUFFICIENT_DATA";
  const v2Gap = v2 === "INSUFFICIENT_DATA";
  if (v1Gap && v2Gap) return "BOTH_EVIDENCE_GAP";
  if (v2Gap) return "V2_EVIDENCE_GAP";
  if (v1Gap) return "V1_EVIDENCE_GAP";
  const v1Positive = v1 === "ADVANCE";
  const v1Negative = v1 === "REJECT";
  const v2Positive = v2 === "ELIGIBLE";
  const v2Negative = v2 === "NOT_QUALIFIED";
  if (v1Positive && v2Positive) return "BOTH_POSITIVE";
  if (v1Positive && v2Negative) return "V1_POSITIVE_V2_NEGATIVE";
  if (v1Negative && v2Positive) return "V1_NEGATIVE_V2_POSITIVE";
  if (v1Negative && v2Negative) return "BOTH_NEGATIVE";
  // REVIEW/WATCH and RISK_REVIEW are not automatically positive or negative.
  return "UNMAPPED";
}

export function countV2ShadowOutcomes(
  rows: readonly { v1Status: string; v2Status: string }[],
): Record<V2ShadowOutcome, number> {
  const counts: Record<V2ShadowOutcome, number> = {
    BOTH_POSITIVE: 0, V1_POSITIVE_V2_NEGATIVE: 0,
    V1_NEGATIVE_V2_POSITIVE: 0, BOTH_NEGATIVE: 0,
    V2_EVIDENCE_GAP: 0, V1_EVIDENCE_GAP: 0,
    BOTH_EVIDENCE_GAP: 0, UNMAPPED: 0,
  };
  for (const row of rows) counts[classifyV2ShadowOutcome(row.v1Status, row.v2Status)]++;
  return counts;
}
