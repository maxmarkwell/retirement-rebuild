import { strict as assert } from "node:assert";
import { verifyV2VendorScaleAttestations, type V2VendorScaleAttestation } from "./v2-vendor-scale-policy";
const income: V2VendorScaleAttestation = {
  provider: "FMP", endpoint: "income-statement", unit: "USD", scale: "ONES",
  specificationUrl: "https://financialmodelingprep.com/developer/docs",
  reviewedAt: "2026-08-01", reviewer: "independent-reviewer",
  effectiveFrom: "2026-01-01", effectiveThrough: "2026-12-31",
};
const cash: V2VendorScaleAttestation = { ...income, endpoint: "cash-flow-statement" };
const check = (rows: V2VendorScaleAttestation[]) =>
  verifyV2VendorScaleAttestations(rows, "2026-09-01");
assert.deepEqual(check([income, cash]), []);
assert.ok(check([income]).includes("SCALE_MISSING_OR_DUPLICATE_ATTESTATION:cash-flow-statement"));
assert.ok(check([income, income, cash]).includes("SCALE_MISSING_OR_DUPLICATE_ATTESTATION:income-statement"));
assert.ok(check([{ ...income, specificationUrl: "https://evil.example/docs" }, cash])
  .includes("SCALE_UNTRUSTED_SPECIFICATION:income-statement"));
assert.ok(check([{ ...income, reviewedAt: "2026-10-01" }, cash])
  .includes("SCALE_INVALID_ATTESTATION_DATES:income-statement"));
assert.ok(check([{ ...income, effectiveThrough: "2026-08-31" }, cash])
  .includes("SCALE_INVALID_ATTESTATION_DATES:income-statement"));
assert.ok(check([{ ...income, reviewer: " " }, cash])
  .includes("SCALE_INVALID_ATTESTATION_DATES:income-statement"));
