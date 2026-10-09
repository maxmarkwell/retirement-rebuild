import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { auditV2VendorScaleArtifacts } from "./v2-vendor-scale-audit";
import type { V2VendorScaleAttestation } from "./v2-vendor-scale-policy";
const bytes = new TextEncoder().encode("archived specification sample");
const sample = new TextEncoder().encode('[{"symbol":"MSFT","period":"Q2"}]');
const sha = createHash("sha256").update(bytes).digest("hex");
const income: V2VendorScaleAttestation = {
  provider: "FMP", endpoint: "income-statement", unit: "USD", scale: "ONES",
  specificationUrl: "https://financialmodelingprep.com/developer/docs",
  specificationSha256: sha, reviewedSampleCount: 2,
  reviewedAt: "2026-08-01", reviewer: "reviewer",
  effectiveFrom: "2026-01-01", effectiveThrough: "2026-12-31",
};
const cash: V2VendorScaleAttestation = { ...income, endpoint: "cash-flow-statement" };
const a = { endpoint: "income-statement" as const, specificationBytes: bytes,
  sampleResponses: [sample, sample] };
const b = { ...a, endpoint: "cash-flow-statement" as const };
const check = (artifacts: (typeof a | typeof b)[]) =>
  auditV2VendorScaleArtifacts([income, cash], artifacts, "2026-09-01");
assert.deepEqual(check([a, b]), []);
assert.ok(check([{ ...a, specificationBytes: new TextEncoder().encode("tampered") }, b])
  .includes("SCALE_AUDIT_SPECIFICATION_DIGEST_MISMATCH:income-statement"));
assert.ok(check([{ ...a, sampleResponses: [sample] }, b])
  .includes("SCALE_AUDIT_INVALID_SAMPLES:income-statement"));
assert.ok(check([{ ...a, sampleResponses: [new TextEncoder().encode("not json"), sample] }, b])
  .includes("SCALE_AUDIT_INVALID_SAMPLE_JSON:income-statement"));
assert.ok(check([a]).includes("SCALE_AUDIT_MISSING_OR_DUPLICATE_ARTIFACT:cash-flow-statement"));
