import { reconcileV2FilingAndVendor } from "./v2-cross-source-reconciliation";
import { verifyV2Observation, type V2VerifiedObservation } from "./v2-data-lineage";

/**
 * Offline, caller-provided evidence alignment. This does not fetch sources,
 * authenticate their contents, or independently determine fiscal calendars.
 */
export type V2ShadowEvidenceBatch = {
  symbol: string;
  issuerId: string;
  fiscalPeriod: string;
  observations: readonly V2VerifiedObservation[];
};
export type V2ShadowEvidenceCheck = { valid: boolean; issues: string[]; checked: number };
const SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/;
export function verifyV2ShadowEvidence(
  batches: readonly V2ShadowEvidenceBatch[],
  expectedSymbols: readonly string[],
  fiscalPeriod: string,
  researchAsOf: string,
  tolerances: Readonly<Record<string, number>> = {},
): V2ShadowEvidenceCheck {
  const issues: string[] = [];
  const asOf = Date.parse(researchAsOf);
  if (!Number.isFinite(asOf)) issues.push("SHADOW_EVIDENCE_INVALID_ASOF");
  const expected = new Set(expectedSymbols.map(x => x.trim().toUpperCase()));
  const seen = new Set<string>();
  let checked = 0;
  for (const batch of batches) {
    const symbol = batch.symbol.trim().toUpperCase();
    if (!SYMBOL.test(symbol) || seen.has(symbol) || !expected.has(symbol))
      issues.push("SHADOW_EVIDENCE_INVALID_SYMBOL:" + symbol);
    seen.add(symbol);
    if (!batch.issuerId.trim() || batch.fiscalPeriod !== fiscalPeriod)
      issues.push("SHADOW_EVIDENCE_BATCH_IDENTITY:" + symbol);
    if (!batch.observations.length)
      issues.push("SHADOW_EVIDENCE_EMPTY:" + symbol);
    const keys = new Set<string>();
    for (const obs of batch.observations) {
      checked++;
      const key = obs.metric + "|" + obs.source.kind;
      if (keys.has(key)) issues.push("SHADOW_EVIDENCE_DUPLICATE_METRIC:" + symbol + ":" + key);
      keys.add(key);
      const errors = verifyV2Observation(obs, {
        metric: obs.metric, fiscalPeriod, issuerId: batch.issuerId,
        unit: obs.unit, allowedKinds: ["FILING", "MARKET_DATA"],
      });
      for (const error of errors) issues.push(symbol + ":" + error);
      const published = Date.parse(obs.source.publishedAt);
      const retrieved = Date.parse(obs.source.retrievedAt);
      if (Number.isFinite(asOf) && (published > asOf || retrieved > asOf))
        issues.push("SHADOW_EVIDENCE_LOOKAHEAD:" + symbol + ":" + obs.metric);
    }
    const filings = batch.observations.filter(x => x.source.kind === "FILING");
    const vendors = batch.observations.filter(x => x.source.kind === "MARKET_DATA");
    if (vendors.length) {
      const filingMetrics = new Set(filings.map(x => x.metric));
      for (const vendor of vendors)
        if (!filingMetrics.has(vendor.metric))
          issues.push("SHADOW_VENDOR_WITHOUT_FILING:" + symbol + ":" + vendor.metric);
      const result = reconcileV2FilingAndVendor(filings, vendors, tolerances);
      for (const issue of result.issues) issues.push("SHADOW_RECONCILIATION:" + symbol + ":" + issue);
    }
  }
  if (seen.size !== expected.size || [...expected].some(s => !seen.has(s)))
    issues.push("SHADOW_EVIDENCE_COVERAGE_MISMATCH");
  return { valid: issues.length === 0, issues, checked };
}
