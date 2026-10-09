import { strict as assert } from "node:assert";
import { normalizeV2VendorQuarters } from "./v2-vendor-normalizer";
const base = {
  issuerId: "CIK-1", publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
  documentId: "vendor-snapshot-1", extractionId: "vendor-normalizer-v2",
  sourceUrl: "https://financialmodelingprep.com/stable/income-statement",
  publisher: "Financial Modeling Prep",
  income: [{ fiscalYear: 2026, period: "Q2", date: "2026-06-30",
    revenue: 100, operatingIncome: 20 }],
  cashFlow: [{ fiscalYear: 2026, period: "Q2", date: "2026-06-30", freeCashFlow: 12 }],
};
const ok = normalizeV2VendorQuarters(base);
assert.deepEqual(ok.issues, []);
assert.equal(ok.observations.length, 3);
assert.equal(ok.observations.find(x => x.metric === "freeCashFlow")?.value, 12);
assert.equal(ok.observations[0].issuerId, "CIK-1");
assert.equal(ok.observations[0].source.documentId, "vendor-snapshot-1");
assert.ok(normalizeV2VendorQuarters({ ...base,
  cashFlow: [{ ...base.cashFlow[0], period: "Q1" }] }).issues.includes("MISSING_MATCHED_CASH_FLOW:2026-Q2"));
assert.ok(normalizeV2VendorQuarters({ ...base,
  cashFlow: [{ ...base.cashFlow[0], date: "2026-03-31" }] }).issues.includes("FISCAL_END_DATE_MISMATCH:2026-Q2"));
assert.ok(normalizeV2VendorQuarters({ ...base,
  income: [base.income[0], base.income[0]] }).issues.some(x => x.startsWith("DUPLICATE_FISCAL_QUARTER")));
assert.ok(normalizeV2VendorQuarters({ ...base,
  cashFlow: [{ ...base.cashFlow[0], freeCashFlow: undefined }] }).issues.some(x => x.startsWith("MISSING_OR_INVALID_METRIC")));
assert.ok(normalizeV2VendorQuarters({ ...base,
  income: [{ ...base.income[0], fiscalYear: undefined }] }).issues.some(x => x.startsWith("INVALID_FISCAL_QUARTER")));
