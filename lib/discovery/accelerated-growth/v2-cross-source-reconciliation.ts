import type { V2VerifiedObservation } from "./v2-data-lineage";

export type V2CrossSourceResult = {
  reconciled: boolean;
  issues: string[];
  comparisons: { metric: string; fiscalPeriod: string; filingValue: number; vendorValue: number; absoluteDifference: number }[];
};

/**
 * Cross-check only metrics measured in the same units, fiscal quarter and
 * issuer. Does not grant filing authenticity or research eligibility.
 */
export function reconcileV2FilingAndVendor(
  filings: readonly V2VerifiedObservation[],
  vendor: readonly V2VerifiedObservation[],
  tolerances: Readonly<Record<string, number>>,
): V2CrossSourceResult {
  const issues: string[] = [];
  const comparisons: V2CrossSourceResult["comparisons"] = [];
  const seen = new Set<string>();
  for (const filing of filings) {
    const key = filing.metric + "|" + filing.fiscalPeriod + "|" + filing.issuerId;
    if (seen.has(key)) { issues.push("DUPLICATE_FILING_METRIC:" + key); continue; }
    seen.add(key);
    if (filing.source.kind !== "FILING") issues.push("EXPECTED_PRIMARY_FILING:" + key);
    const matches = vendor.filter(x =>
      x.metric === filing.metric && x.fiscalPeriod === filing.fiscalPeriod &&
      x.issuerId === filing.issuerId);
    if (matches.length !== 1) { issues.push("MISSING_OR_DUPLICATE_VENDOR_MATCH:" + key); continue; }
    const other = matches[0];
    if (other.source.kind !== "MARKET_DATA") issues.push("EXPECTED_VENDOR_MARKET_DATA:" + key);
    if (filing.unit !== other.unit) { issues.push("UNIT_MISMATCH:" + key); continue; }
    if (!Number.isFinite(filing.value) || !Number.isFinite(other.value)) {
      issues.push("INVALID_RECONCILIATION_VALUE:" + key); continue;
    }
    if (!filing.documentId.trim() || !other.documentId.trim() ||
        !filing.extractionId.trim() || !other.extractionId.trim() ||
        filing.documentId === other.documentId ||
        filing.extractionId === other.extractionId)
      issues.push("NOT_INDEPENDENT_EXTRACTION:" + key);
    const tolerance = tolerances[filing.metric];
    if (tolerance == null || !Number.isFinite(tolerance) || tolerance < 0) {
      issues.push("INVALID_TOLERANCE:" + key); continue;
    }
    const difference = Math.abs(filing.value - other.value);
    comparisons.push({ metric: filing.metric, fiscalPeriod: filing.fiscalPeriod,
      filingValue: filing.value, vendorValue: other.value, absoluteDifference: difference });
    if (difference > tolerance) issues.push("VALUE_DISAGREEMENT:" + key);
  }
  for (const item of vendor) {
    if (!seen.has(item.metric + "|" + item.fiscalPeriod + "|" + item.issuerId))
      issues.push("UNMATCHED_VENDOR_METRIC:" + item.metric + "|" + item.fiscalPeriod);
  }
  if (!filings.length || !vendor.length) issues.push("NO_RECONCILIATION_DATA");
  return { reconciled: issues.length === 0, issues, comparisons };
}
