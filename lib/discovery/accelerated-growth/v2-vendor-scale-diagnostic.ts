/**
 * Offline diagnostic only: detect common vendor/filing scale mismatches.
 * A match is NOT proof of provenance, correct accounting definitions, or
 * authorization to normalize vendor values.
 */
export type V2ScalePair = {
  issuerId: string;
  fiscalPeriod: string;
  metric: string;
  filingUsd: number;
  vendorAmount: number;
};
export type V2ScaleDiagnostic = {
  consistent: boolean;
  candidateScale: 1 | 1000 | 1000000 | null;
  issues: string[];
};
export function diagnoseV2VendorMonetaryScale(
  pairs: readonly V2ScalePair[],
  relativeTolerance = 0.01,
): V2ScaleDiagnostic {
  const issues: string[] = [];
  if (!Number.isFinite(relativeTolerance) || relativeTolerance < 0 ||
      relativeTolerance > 0.01)
    return { consistent: false, candidateScale: null, issues: ["SCALE_INVALID_TOLERANCE"] };
  if (pairs.length < 2 || pairs.length > 500)
    issues.push("SCALE_INSUFFICIENT_COMPARISONS");
  const keys = new Set<string>();
  const issuers = new Set<string>();
  const periods = new Set<string>();
  const candidates = [1, 1000, 1000000] as const;
  let common: (typeof candidates)[number][] = [...candidates];
  for (const pair of pairs) {
    const key = pair.issuerId + "|" + pair.fiscalPeriod + "|" + pair.metric;
    if (!pair.issuerId.trim() || !/^\d{4}-Q[1-4]$/.test(pair.fiscalPeriod) ||
        !pair.metric.trim() || keys.has(key)) issues.push("SCALE_INVALID_PAIR:" + key);
    keys.add(key);
    issuers.add(pair.issuerId);
    periods.add(pair.fiscalPeriod);
    if (!Number.isFinite(pair.filingUsd) || !Number.isFinite(pair.vendorAmount) ||
        pair.filingUsd === 0 || pair.vendorAmount === 0) {
      issues.push("SCALE_UNCOMPARABLE_VALUES:" + key);
      continue;
    }
    const matches = candidates.filter(scale =>
      Math.abs(pair.vendorAmount * scale - pair.filingUsd) /
        Math.abs(pair.filingUsd) <= relativeTolerance);
    if (!matches.length) issues.push("SCALE_NO_MATCH:" + key);
    common = common.filter(scale => matches.includes(scale));
  }
  if (issuers.size < 2) issues.push("SCALE_INSUFFICIENT_ISSUER_COVERAGE");
  if (periods.size < 2) issues.push("SCALE_INSUFFICIENT_PERIOD_COVERAGE");
  if (!common.length) issues.push("SCALE_INCONSISTENT_ACROSS_PAIRS");
  if (common.length > 1) issues.push("SCALE_AMBIGUOUS");
  return {
    consistent: issues.length === 0,
    candidateScale: issues.length === 0 ? common[0] : null,
    issues,
  };
}
