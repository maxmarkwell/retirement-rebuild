import { strict as assert } from "node:assert";
import { retrieveV2VendorQuarters } from "./v2-vendor-transport";
const incomeUrl = "https://financialmodelingprep.com/stable/income-statement?symbol=MSFT";
const cashFlowUrl = "https://financialmodelingprep.com/stable/cash-flow-statement?symbol=MSFT";
const row = { fiscalYear: 2026, period: "Q2", date: "2026-06-30",
  reportedCurrency: "USD", revenue: 100, operatingIncome: 20, freeCashFlow: 12 };
let calls = 0;
const fetcher = async () => {
  calls++;
  return new Response(JSON.stringify([row]), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
const base = { enabled: true, issuerId: "CIK-1", incomeUrl, cashFlowUrl,
  publishedAt: "2026-08-01", retrievedAt: "2026-08-02",
  documentId: "vendor-document", extractionId: "vendor-extraction",
  publisher: "Financial Modeling Prep", fetcher: fetcher as typeof fetch };
async function main() {
  assert.deepEqual(await retrieveV2VendorQuarters({ ...base, enabled: false }),
    { ok: false, issues: ["VENDOR_TRANSPORT_DISABLED"] });
  assert.equal(calls, 0);
  assert.deepEqual(await retrieveV2VendorQuarters({
    ...base, incomeUrl: "https://evil.example/income",
  }), { ok: false, issues: ["VENDOR_TRANSPORT_INVALID_URL"] });
  assert.deepEqual(await retrieveV2VendorQuarters({
    ...base, incomeUrl: incomeUrl + "&apikey=secret",
  }), { ok: false, issues: ["VENDOR_TRANSPORT_INVALID_URL"] });
  for (const invalid of [
    incomeUrl + "&APIKEY=secret",
    incomeUrl + "&redirect=https://example.org",
    "https://financialmodelingprep.com/stable/profile?symbol=MSFT",
    "https://financialmodelingprep.com/stable/income-statement?symbol=MSFT&symbol=AAPL",
    "https://financialmodelingprep.com/stable/income-statement?symbol=MSFT%26apikey%3Dsecret",
  ]) {
    assert.deepEqual(await retrieveV2VendorQuarters({ ...base, incomeUrl: invalid }),
      { ok: false, issues: ["VENDOR_TRANSPORT_INVALID_URL"] });
  }
  assert.deepEqual(await retrieveV2VendorQuarters({
    ...base, cashFlowUrl: cashFlowUrl.replace("MSFT", "AAPL"),
  }), { ok: false, issues: ["VENDOR_TRANSPORT_INVALID_URL"] });
  assert.equal(calls, 0);
  assert.deepEqual(await retrieveV2VendorQuarters(base),
    { ok: false, issues: ["VENDOR_TRANSPORT_SCALE_UNVERIFIED"] });
  assert.equal(calls, 2);
  const wrongCurrency = async () => new Response(JSON.stringify([
    { ...row, reportedCurrency: "EUR" },
  ]), { headers: { "content-type": "application/json" } });
  assert.deepEqual(await retrieveV2VendorQuarters({
    ...base, fetcher: wrongCurrency as typeof fetch,
  }), { ok: false, issues: ["VENDOR_TRANSPORT_CURRENCY_UNVERIFIED"] });
  const oversized = async () => new Response("[]", {
    headers: { "content-type": "application/json", "content-length": "2000001" },
  });
  assert.deepEqual(await retrieveV2VendorQuarters({
    ...base, fetcher: oversized as typeof fetch,
  }), { ok: false, issues: ["VENDOR_RESPONSE_TOO_LARGE"] });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
