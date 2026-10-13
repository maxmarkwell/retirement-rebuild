import { verifyV2Observation, type V2VerifiedObservation } from "./v2-data-lineage";
import { diagnoseV2VendorMonetaryScale, type V2ScaleDiagnostic, type V2ScalePair } from "./v2-vendor-scale-diagnostic";

/**
 * Offline bridge from independently supplied source observations to the scale
 * diagnostic. Neither observation metadata nor document authenticity is
 * established by this function. It NEVER authorizes live vendor ingestion.
 */
export function diagnoseV2ScaleFromObservations(
  filings: readonly V2VerifiedObservation[],
  vendors: readonly V2VerifiedObservation[],
  researchAsOf: string,
): V2ScaleDiagnostic {
  const issues: string[] = [];
  const asOf = Date.parse(researchAsOf);
  if (!Number.isFinite(asOf)) issues.push("SCALE_BRIDGE_INVALID_ASOF");
  if (filings.length > 500 || vendors.length > 500)
    issues.push("SCALE_BRIDGE_TOO_MANY_OBSERVATIONS");
  const key = (o: V2VerifiedObservation) =>
    o.issuerId + "|" + o.fiscalPeriod + "|" + o.metric;
  const filingMap = new Map<string, V2VerifiedObservation>();
  const vendorMap = new Map<string, V2VerifiedObservation>();
  for (const [rows, kind, target] of [
    [filings, "FILING", filingMap],
    [vendors, "MARKET_DATA", vendorMap],
  ] as const) {
    for (const row of rows) {
      const k = key(row);
      if (target.has(k)) issues.push("SCALE_BRIDGE_DUPLICATE:" + kind + ":" + k);
      target.set(k, row);
      try {
        const url = new URL(row.source.url);
        const allowedHost = kind === "FILING" ?
          url.hostname === "data.sec.gov" :
          url.hostname === "financialmodelingprep.com";
        if (url.protocol !== "https:" || !allowedHost || url.username || url.password)
          issues.push("SCALE_BRIDGE_UNTRUSTED_SOURCE_URL:" + kind + ":" + k);
      } catch { issues.push("SCALE_BRIDGE_UNTRUSTED_SOURCE_URL:" + kind + ":" + k); }
      if (row.source.documentId !== row.documentId ||
          row.source.extractionId !== row.extractionId ||
          row.source.issuerId !== row.issuerId)
        issues.push("SCALE_BRIDGE_SOURCE_IDENTITY_MISMATCH:" + k);
      if (row.unit !== "USD" || row.source.unit !== "USD")
        issues.push("SCALE_BRIDGE_NON_USD:" + k);
      for (const error of verifyV2Observation(row, {
        issuerId: row.issuerId, fiscalPeriod: row.fiscalPeriod, metric: row.metric,
        unit: "USD", allowedKinds: [kind],
      })) issues.push("SCALE_BRIDGE_LINEAGE:" + kind + ":" + k + ":" + error);
      if (Number.isFinite(asOf) &&
          (Date.parse(row.source.publishedAt) > asOf ||
           Date.parse(row.source.retrievedAt) > asOf))
        issues.push("SCALE_BRIDGE_LOOKAHEAD:" + kind + ":" + k);
    }
  }
  const pairs: V2ScalePair[] = [];
  for (const [k, filing] of filingMap) {
    const vendor = vendorMap.get(k);
    if (!vendor) { issues.push("SCALE_BRIDGE_MISSING_VENDOR:" + k); continue; }
    if (!filing.documentId.trim() || !vendor.documentId.trim() ||
        filing.documentId === vendor.documentId ||
        !filing.extractionId.trim() || !vendor.extractionId.trim() ||
        filing.extractionId === vendor.extractionId ||
        filing.source.url === vendor.source.url)
      issues.push("SCALE_BRIDGE_NONINDEPENDENT_SOURCE:" + k);
    pairs.push({ issuerId: filing.issuerId, fiscalPeriod: filing.fiscalPeriod,
      metric: filing.metric, filingUsd: filing.value, vendorAmount: vendor.value });
  }
  for (const k of vendorMap.keys())
    if (!filingMap.has(k)) issues.push("SCALE_BRIDGE_UNMATCHED_VENDOR:" + k);
  const diagnostic = diagnoseV2VendorMonetaryScale(pairs);
  return { consistent: issues.length === 0 && diagnostic.consistent,
    candidateScale: issues.length === 0 ? diagnostic.candidateScale : null,
    issues: [...issues, ...diagnostic.issues] };
}
