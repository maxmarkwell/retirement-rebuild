import { strict as assert } from "node:assert";
import { diagnoseV2VendorMonetaryScale } from "./v2-vendor-scale-diagnostic";
const a = { issuerId: "CIK-1", fiscalPeriod: "2026-Q1", metric: "revenue",
  filingUsd: 100_000_000, vendorAmount: 100_000_000 };
const b = { ...a, issuerId: "CIK-2", fiscalPeriod: "2026-Q2", filingUsd: 110_000_000,
  vendorAmount: 110_000_000 };
const check = (rows = [a, b], tolerance?: number) =>
  diagnoseV2VendorMonetaryScale(rows, tolerance);
assert.deepEqual(check(), { consistent: true, candidateScale: 1, issues: [] });
assert.equal(check([{ ...a, vendorAmount: 100_000 }, { ...b, vendorAmount: 110_000 }])
  .candidateScale, 1000);
assert.equal(check([{ ...a, vendorAmount: 100 }, { ...b, vendorAmount: 110 }])
  .candidateScale, 1000000);
assert.ok(check([{ ...a, vendorAmount: 100_000 }, b])
  .issues.includes("SCALE_INCONSISTENT_ACROSS_PAIRS"));
assert.ok(check([a, a]).issues.some(x => x.startsWith("SCALE_INVALID_PAIR:")));
assert.ok(check([a]).issues.includes("SCALE_INSUFFICIENT_COMPARISONS"));
assert.ok(check([{ ...a, vendorAmount: 0 }, b])
  .issues.some(x => x.startsWith("SCALE_UNCOMPARABLE_VALUES:")));
assert.ok(check([a, { ...b, vendorAmount: 3 }])
  .issues.some(x => x.startsWith("SCALE_NO_MATCH:")));
assert.ok(check([a, b], 0.2).issues.includes("SCALE_INVALID_TOLERANCE"));

assert.ok(check([a, { ...b, issuerId: "CIK-1" }])
  .issues.includes("SCALE_INSUFFICIENT_ISSUER_COVERAGE"));
assert.ok(check([a, { ...b, fiscalPeriod: "2026-Q1" }])
  .issues.includes("SCALE_INSUFFICIENT_PERIOD_COVERAGE"));

assert.equal(check([
  { ...a, filingUsd: -100_000_000, vendorAmount: -100_000_000 },
  { ...b, filingUsd: -110_000_000, vendorAmount: -110_000_000 },
]).candidateScale, 1);
assert.ok(check([{ ...a, vendorAmount: -100_000_000 }, b])
  .issues.some(x => x.startsWith("SCALE_NO_MATCH:")));
assert.equal(check([{ ...a, vendorAmount: 99_500_000 }, b]).candidateScale, 1);
assert.ok(check([{ ...a, vendorAmount: 98_000_000 }, b])
  .issues.some(x => x.startsWith("SCALE_NO_MATCH:")));
assert.ok(check([{ ...a, filingUsd: Number.NaN }, b])
  .issues.some(x => x.startsWith("SCALE_UNCOMPARABLE_VALUES:")));
assert.ok(check([{ ...a, fiscalPeriod: "FY" }, b])
  .issues.some(x => x.startsWith("SCALE_INVALID_PAIR:")));
