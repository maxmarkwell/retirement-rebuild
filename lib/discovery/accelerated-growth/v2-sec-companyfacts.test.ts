import { strict as assert } from "node:assert";
import { normalizeV2SecCompanyFacts, type V2SecFact } from "./v2-sec-companyfacts";
import { verifyV2Observation } from "./v2-data-lineage";
const accession = "0000000001-26-000001";
const fact = (val: number, extra: Partial<V2SecFact> = {}): V2SecFact => ({
  start: "2026-04-01", end: "2026-06-30", val, accn: accession,
  form: "10-Q", filed: "2026-08-01", frame: "CY2026Q2", ...extra,
});
const companyfacts = {
  cik: 1, entityName: "Fixture Corp",
  facts: { "us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [fact(100)] } },
    OperatingIncomeLoss: { units: { USD: [fact(20)] } },
    NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fact(25)] } },
    PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact(10)] } },
  } },
};
const input = { companyfacts, accession, fiscalPeriod: "2026-Q2",
  fiscalEnd: "2026-06-30", retrievedAt: "2026-08-02",
  sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json",
  extractionId: "sec-companyfacts-v2", calendarFrameAligned: true };
const result = normalizeV2SecCompanyFacts(input);
assert.deepEqual(result.issues, []);
assert.equal(result.observations.length, 4);
assert.equal(result.observations[0].source.kind, "FILING");
assert.equal(result.observations[0].documentId, accession);
assert.deepEqual(verifyV2Observation(result.observations[0], {
  metric: "revenue", fiscalPeriod: "2026-Q2", issuerId: "CIK-0000000001",
  unit: "USD", allowedKinds: ["FILING"],
}), []);
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  companyfacts: { ...companyfacts, facts: { "us-gaap": {
    ...companyfacts.facts["us-gaap"],
    OperatingIncomeLoss: { units: { USD: [fact(20, { start: "2026-01-01" })] } },
  } } },
}).issues.includes("SEC_MISSING_OR_AMBIGUOUS_QUARTERLY_FACT:operatingIncome"),
  "Year-to-date cash flow or income cannot masquerade as a single quarter");
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  companyfacts: { ...companyfacts, facts: { "us-gaap": {
    ...companyfacts.facts["us-gaap"],
    OperatingIncomeLoss: { units: { USD: [fact(20), fact(21)] } },
  } } },
}).issues.includes("SEC_MISSING_OR_AMBIGUOUS_QUARTERLY_FACT:operatingIncome"));
assert.ok(normalizeV2SecCompanyFacts({ ...input, accession: "OTHER" }).issues.length > 0);
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  sourceUrl: "https://example.org/pretend-sec" }).issues.includes("SEC_UNTRUSTED_SOURCE_URL"));
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  companyfacts: { ...companyfacts, facts: { "us-gaap": {
    ...companyfacts.facts["us-gaap"],
    OperatingIncomeLoss: { units: { USD: [fact(20, { frame: "CY2026Q1" })] } },
  } } },
}).issues.includes("SEC_MISSING_OR_AMBIGUOUS_QUARTERLY_FACT:operatingIncome"));

assert.ok(normalizeV2SecCompanyFacts({ ...input,
  sourceUrl: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000000002.json",
}).issues.includes("SEC_SOURCE_CIK_MISMATCH"));
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  accession: "0000000002-26-000001",
}).issues.includes("SEC_ACCESSION_CIK_MISMATCH"));
assert.ok(normalizeV2SecCompanyFacts({ ...input,
  calendarFrameAligned: false,
}).issues.some(x => x.startsWith("SEC_MISSING_OR_AMBIGUOUS_QUARTERLY_FACT")),
  "Off-calendar issuers require verified fiscal mapping");
