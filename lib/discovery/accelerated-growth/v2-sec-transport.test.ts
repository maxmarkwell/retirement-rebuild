import { strict as assert } from "node:assert";
import { retrieveV2SecCompanyFacts } from "./v2-sec-transport";

const cik = 1;
const accession = "0000000001-26-000001";
const fact = (val: number) => ({
  start: "2026-04-01", end: "2026-06-30", val, accn: accession,
  form: "10-Q", filed: "2026-08-01", frame: "CY2026Q2",
});
const payload = {
  cik, entityName: "Test issuer",
  facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [fact(100)] } },
    OperatingIncomeLoss: { units: { USD: [fact(20)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fact(30)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact(8)] } },
  } },
};
const base = {
  enabled: true, cik, accession, fiscalPeriod: "2026-Q2",
  fiscalEnd: "2026-06-30", retrievedAt: "2026-08-02",
  userAgent: "Retirement Rebuild research contact@example.org",
};
let calls = 0;
const fetcher: typeof fetch = async (url, init) => {
  calls++;
  assert.equal(url, "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json");
  assert.equal(init?.method, "GET");
  assert.equal(init?.redirect, "error");
  return new Response(JSON.stringify(payload), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
assert.deepEqual(await retrieveV2SecCompanyFacts({
  ...base, enabled: false, fetcher,
}), { ok: false, issues: ["SEC_TRANSPORT_DISABLED"] });
assert.equal(calls, 0, "Disabled transport must not make network requests");
const success = await retrieveV2SecCompanyFacts({ ...base, fetcher });
assert.equal(success.ok, true);
if (success.ok) assert.equal(success.data.observations.length, 4);
assert.equal(calls, 1);
assert.deepEqual(await retrieveV2SecCompanyFacts({
  ...base, accession: "0000000002-26-000001", fetcher,
}), { ok: false, issues: ["SEC_TRANSPORT_ACCESSION_CIK_MISMATCH"] });
assert.equal(calls, 1, "Mismatched accession must fail before fetch");
const invalidCik = await retrieveV2SecCompanyFacts({
  ...base, fetcher: async () => new Response(JSON.stringify({ ...payload, cik: 2 }),
    { headers: { "content-type": "application/json" } }),
});
assert.deepEqual(invalidCik, { ok: false, issues: ["SEC_CIK_OR_FACTS_MISMATCH"] });
const invalidType = await retrieveV2SecCompanyFacts({
  ...base, fetcher: async () => new Response(JSON.stringify(payload),
    { headers: { "content-type": "text/html" } }),
});
assert.deepEqual(invalidType, { ok: false, issues: ["SEC_UNEXPECTED_CONTENT_TYPE"] });
const oversized = await retrieveV2SecCompanyFacts({
  ...base, fetcher: async () => new Response("{}", {
    headers: { "content-type": "application/json", "content-length": "12000001" },
  }),
});
assert.deepEqual(oversized, { ok: false, issues: ["SEC_RESPONSE_TOO_LARGE"] });
const failed = await retrieveV2SecCompanyFacts({
  ...base, fetcher: async () => new Response("no", { status: 429 }),
});
assert.deepEqual(failed, { ok: false, issues: ["SEC_HTTP_STATUS:429"] });
