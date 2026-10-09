import { strict as assert } from "node:assert";
import { diagnoseV2ScaleFromObservations } from "./v2-scale-evidence-bridge";
import type { V2VerifiedObservation } from "./v2-data-lineage";
function observation(issuerId: string, fiscalPeriod: string, kind: "FILING" | "MARKET_DATA",
  value: number): V2VerifiedObservation {
  const documentId = kind + ":" + issuerId + ":" + fiscalPeriod;
  const extractionId = kind + "-extractor";
  const source = {
    kind, url: kind === "FILING" ?
      "https://data.sec.gov/api/xbrl/companyfacts/" + issuerId :
      "https://financialmodelingprep.com/stable/income-statement",
    publisher: kind === "FILING" ? "SEC" : "FMP",
    publishedAt: "2026-07-15", retrievedAt: "2026-08-01",
    issuerId, fiscalPeriod, metric: "revenue", unit: "USD" as const,
    documentId, extractionId,
  };
  return { issuerId, fiscalPeriod, metric: "revenue", value, unit: "USD",
    documentId, extractionId, source };
}
const filings = [
  observation("CIK-1", "2026-Q1", "FILING", 100_000_000),
  observation("CIK-2", "2026-Q2", "FILING", 110_000_000),
];
const vendors = [
  observation("CIK-1", "2026-Q1", "MARKET_DATA", 100_000_000),
  observation("CIK-2", "2026-Q2", "MARKET_DATA", 110_000_000),
];
const check = (f: V2VerifiedObservation[] = filings,
  v: V2VerifiedObservation[] = vendors, asOf = "2026-09-01") =>
  diagnoseV2ScaleFromObservations(f, v, asOf);
assert.deepEqual(check(), { consistent: true, candidateScale: 1, issues: [] });
assert.equal(check(filings, vendors.map(x => ({ ...x, value: x.value / 1000 })))
  .candidateScale, 1000);
assert.ok(check(filings, vendors.slice(0, 1)).issues.some(x =>
  x.startsWith("SCALE_BRIDGE_MISSING_VENDOR:")));
assert.ok(check(filings, [...vendors, vendors[0]]).issues.some(x =>
  x.startsWith("SCALE_BRIDGE_DUPLICATE:")));
assert.ok(check(filings, [...vendors, observation("CIK-3", "2026-Q3", "MARKET_DATA", 50)])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_UNMATCHED_VENDOR:")));
assert.ok(check(filings, [{ ...vendors[0], documentId: filings[0].documentId }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_NONINDEPENDENT_SOURCE:")));
assert.ok(check(filings, [{ ...vendors[0], extractionId: filings[0].extractionId }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_NONINDEPENDENT_SOURCE:")));
assert.ok(check(filings, [{ ...vendors[0], unit: "USD_MILLIONS" }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_NON_USD:")));
assert.ok(check(filings, [{ ...vendors[0], source: { ...vendors[0].source,
  publishedAt: "2026-10-01" } }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_LOOKAHEAD:")));
assert.ok(check(filings, vendors, "invalid")
  .issues.includes("SCALE_BRIDGE_INVALID_ASOF"));
assert.ok(check(filings, [{ ...vendors[0], value: 0 }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_UNCOMPARABLE_VALUES:")));

assert.ok(check(filings, [{ ...vendors[0], source: { ...vendors[0].source,
  documentId: "other" } }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_SOURCE_IDENTITY_MISMATCH:")));
assert.ok(check(filings, [{ ...vendors[0], source: { ...vendors[0].source,
  issuerId: "CIK-OTHER" } }, vendors[1]])
  .issues.some(x => x.startsWith("SCALE_BRIDGE_SOURCE_IDENTITY_MISMATCH:")));
