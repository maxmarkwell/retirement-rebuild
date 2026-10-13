import { strict as assert } from "node:assert";
import { test } from "node:test";
import { auditValuationNarrative } from "./valuation-narrative-audit";

const values = { vendorMarketCap: 5.468e12, vendorEnterpriseValue: 5.484e12, secMarketCap: 5.468e12, secEnterpriseValue: 5.484e12 };

test("correct vendor values are checked", () => {
  const result = auditValuationNarrative("Its vendor market capitalization is $5.468 trillion and enterprise value is $5.484 trillion.", values);
  assert.equal(result.status, "PASS");
  assert.equal(result.checked, 2);
});
test("original thousand-fold trillion error is flagged", () => {
  const result = auditValuationNarrative("FMP vendor market capitalization was $5,468 trillion.", values);
  assert.equal(result.status, "FLAGGED");
  assert.equal(result.checked, 1);
});
test("SEC diagnostics checked against SEC basis", () => {
  const result = auditValuationNarrative("SEC-derived market capitalization of $5.468 trillion.", values);
  assert.equal(result.status, "PASS");
  assert.equal(result.checked, 1);
});
test("incorrect SEC number flagged", () => {
  const result = auditValuationNarrative("SEC-derived market capitalization of $3 trillion.", values);
  assert.equal(result.status, "FLAGGED");
});
test("unattributed prose remains not evaluated", () => {
  const result = auditValuationNarrative("Market capitalization is $5.468 trillion.", values);
  assert.equal(result.status, "NOT_EVALUATED");
});
