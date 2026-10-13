import { strict as assert } from "node:assert";
import { test } from "node:test";
import { auditValuationNarrative } from "./valuation-narrative-audit";

const values = { vendorMarketCap: 5.468e12, vendorEnterpriseValue: 5.484e12, secMarketCap: 5.468e12, secEnterpriseValue: 5.484e12, vendorPriceToSales: 18.08, vendorPriceToEarnings: 28.4, vendorEvToSales: 18.13, secPriceToSales: 32.85, secPriceToEarnings: 1017.08, secEvToSales: 30.25 };

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

test("vendor multiples are checked and exposed individually", () => {
  const result = auditValuationNarrative("FMP vendor P/S 18.08x, P/E 28.40x, EV/sales 18.13x.", values);
  assert.equal(result.status, "PASS");
  assert.equal(result.checked, 3);
  assert.equal(result.claimsChecked?.length, 3);
});
test("incorrect SEC valuation multiple is flagged", () => {
  const result = auditValuationNarrative("SEC-derived P/S 25.43x.", values);
  assert.equal(result.status, "FLAGGED");
  assert.equal(result.checked, 1);
});
test("mixed-basis multiples are not silently assigned", () => {
  const result = auditValuationNarrative("Vendor and SEC P/S 18.08x.", values);
  assert.equal(result.status, "NOT_EVALUATED");
});
