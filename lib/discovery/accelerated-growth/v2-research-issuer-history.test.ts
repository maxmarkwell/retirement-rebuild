import { strict as assert } from "node:assert";
import { compareV2ResearchHistoryWithIssuers } from "./v2-research-issuer-history";
import type { V2ResearchCandidate } from "./v2-research-priority";
const candidate = (symbol: string): V2ResearchCandidate => ({
  symbol, origin: "NEW_DISCOVERY", assessments: [{
    version: "ag-opportunity-v2", path: "CATALYST", status: "QUALIFIED",
    evidenceCoverage: 90, evidenceStrength: null, supportingFacts: [],
    contradictingFacts: [], missingCriticalEvidence: [],
    economicMechanism: "fixture", invalidationConditions: [],
  }],
});
const cycle = (runId: string, capturedAt: string, researchAsOf: string) => ({
  pipelineVersion: "ag-opportunity-v2" as const, runId, capacity: 1,
  capturedAt, researchAsOf, v1SelectedSymbols: ["AAA"],
  candidates: [candidate("AAA"), candidate("BBB")],
});
const first = cycle("identity_001", "2026-08-03T12:00:00Z", "2026-08-02T12:00:00Z");
const second = cycle("identity_002", "2026-08-04T12:00:00Z", "2026-08-03T12:00:00Z");
const identities = [
  { symbol: "AAA", issuerId: "CIK-123", effectiveAt: "2026-07-01T00:00:00Z" },
  { symbol: "BBB", issuerId: "CIK-456", effectiveAt: "2026-07-01T00:00:00Z" },
];
const base = { pipelineVersion: "ag-opportunity-v2" as const,
  cycles: [first, second], issuerIdentitiesByCycle: [identities, identities] };
const result = compareV2ResearchHistoryWithIssuers(base);
assert.equal(result.accepted, true);
if (result.accepted) {
  assert.equal(result.uniqueV1Issuers, 1);
  assert.equal(result.uniqueV2Issuers, 1);
  assert.equal(result.v1IssuerRepeatSlots, 1);
  assert.equal(result.v2IssuerRepeatSlots, 1);
}
function rejects(request: typeof base, issue: string) {
  const result = compareV2ResearchHistoryWithIssuers(request);
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.ok(result.issues.some(x => x.includes(issue)), issue);
}
rejects({ ...base, issuerIdentitiesByCycle: [identities] },
  "IDENTITY_CYCLE_COUNT_MISMATCH");
rejects({ ...base, issuerIdentitiesByCycle: [identities, identities.slice(0, 1)] },
  "INCOMPLETE_UNIVERSE_IDENTITY");
rejects({ ...base, issuerIdentitiesByCycle: [identities, [identities[0], identities[0]]] },
  "INVALID_IDENTITY");
rejects({ ...base, issuerIdentitiesByCycle: [identities, [
  identities[0], { ...identities[1], issuerId: "CIK-123" }]] },
  "DUPLICATE_ISSUER");
rejects({ ...base, issuerIdentitiesByCycle: [identities, [
  { ...identities[0], issuerId: "CIK-999" }, identities[1]]] },
  "SYMBOL_REUSED");
rejects({ ...base, issuerIdentitiesByCycle: [identities, [
  identities[0], { ...identities[1], issuerId: "CIK-999",
    effectiveAt: "2026-09-01T00:00:00Z" }]] },
  "INVALID_IDENTITY");
rejects({ ...base, issuerIdentitiesByCycle: [identities, [
  identities[0], { ...identities[1], issuerId: "invalid" }]] },
  "INVALID_IDENTITY");
rejects({ ...base, cycles: [second, first] }, "NONMONOTONIC_ASOF");

rejects({ ...base, issuerIdentitiesByCycle: [identities,
  Array.from({ length: 2001 }, () => identities[0])] },
  "TOO_MANY_IDENTITIES");
