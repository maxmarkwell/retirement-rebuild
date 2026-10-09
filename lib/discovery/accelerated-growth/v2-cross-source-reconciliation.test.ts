import { strict as assert } from "node:assert";
import { reconcileV2FilingAndVendor } from "./v2-cross-source-reconciliation";
import type { V2VerifiedObservation } from "./v2-data-lineage";
const source = { url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json",
  publisher: "SEC EDGAR", publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
  fiscalPeriod: "2026-Q2", metric: "revenue", kind: "FILING" as const };
const filing: V2VerifiedObservation = {
  metric: "revenue", value: 100, unit: "USD", fiscalPeriod: "2026-Q2",
  issuerId: "CIK-0000000001", documentId: "sec-accession", extractionId: "sec-extractor",
  source,
};
const vendor: V2VerifiedObservation = {
  ...filing, value: 100.1, documentId: "vendor-snapshot", extractionId: "vendor-extractor",
  source: { ...source, kind: "MARKET_DATA",
    url: "https://financialmodelingprep.com/stable/income-statement" },
};
const compare = (f: V2VerifiedObservation[] = [filing],
  v: V2VerifiedObservation[] = [vendor], t: Record<string, number> = { revenue: 0.2 }) =>
  reconcileV2FilingAndVendor(f, v, t);
assert.equal(compare().reconciled, true);
assert.equal(compare().comparisons[0].absoluteDifference < 0.2, true);
assert.equal(compare([filing], [{ ...vendor, value: 105 }]).reconciled, false);
assert.equal(compare([filing], [{ ...vendor, unit: "USD_MILLIONS" }]).reconciled, false);
assert.equal(compare([filing], [{ ...vendor, issuerId: "OTHER" }]).reconciled, false);
assert.equal(compare([filing], [{ ...vendor, fiscalPeriod: "2026-Q1" }]).reconciled, false);
assert.equal(compare([filing], [{ ...vendor, documentId: "sec-accession" }]).reconciled, false);
assert.equal(compare([filing], [{ ...vendor, extractionId: "sec-extractor" }]).reconciled, false);
assert.equal(compare([filing, filing]).reconciled, false);
assert.equal(compare([], []).reconciled, false);
assert.equal(compare([filing], [vendor], { revenue: Number.POSITIVE_INFINITY }).reconciled, false);
