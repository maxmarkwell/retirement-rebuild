import { strict as assert } from "node:assert";
import { verifyV2ShadowEvidence } from "./v2-shadow-evidence";
import type { V2VerifiedObservation } from "./v2-data-lineage";
const obs: V2VerifiedObservation = {
  metric: "revenue", value: 100, unit: "USD", fiscalPeriod: "2026-Q2",
  issuerId: "CIK-0000000001", documentId: "sec-2026q2", extractionId: "extract-sec-1",
  source: { url: "https://www.sec.gov/filing", publisher: "SEC",
    publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
    fiscalPeriod: "2026-Q2", metric: "revenue", kind: "FILING" },
};
const batch = { symbol: "MSFT", issuerId: obs.issuerId, fiscalPeriod: "2026-Q2", observations: [obs] };
const check = (batches: typeof batch[]) =>
  verifyV2ShadowEvidence(batches, ["MSFT"], "2026-Q2", "2026-08-10");
assert.deepEqual(check([batch]), { valid: true, issues: [], checked: 1 });
assert.ok(check([{ ...batch, observations: [{ ...obs, fiscalPeriod: "2026-Q1" }] }])
  .issues.includes("MSFT:LINEAGE_PERIOD_MISMATCH"));
assert.ok(check([{ ...batch, observations: [{ ...obs, issuerId: "CIK-OTHER" }] }])
  .issues.includes("MSFT:LINEAGE_ISSUER_MISMATCH"));
assert.ok(check([{ ...batch, observations: [{ ...obs,
  source: { ...obs.source, retrievedAt: "2026-08-11" } }] }])
  .issues.includes("SHADOW_EVIDENCE_LOOKAHEAD:MSFT:revenue"));
assert.ok(check([{ ...batch, observations: [obs, obs] }])
  .issues.includes("SHADOW_EVIDENCE_DUPLICATE_METRIC:MSFT:revenue|FILING"));
assert.ok(check([]).issues.includes("SHADOW_EVIDENCE_COVERAGE_MISMATCH"));
assert.ok(check([{ ...batch, observations: [] }]).issues.includes("SHADOW_EVIDENCE_EMPTY:MSFT"));
