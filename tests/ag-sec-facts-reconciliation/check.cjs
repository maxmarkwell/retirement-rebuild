const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync("lib/discovery/accelerated-growth/sec-facts-reconciliation.ts", "utf8");
const route = fs.readFileSync("app/api/accelerated-growth/sec-facts-reconciliation/route.ts", "utf8");
const sql = fs.readFileSync("supabase/migrations/20261104110000_ag_sec_facts_active_uniqueness.sql", "utf8");
const js = ts.transpileModule(source.replace(/^import "server-only";\s*/m, ""), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(js, { exports: moduleExports, AbortSignal });
const { reconcileCompanyFacts, AG_SEC_FACTS_VERSION } = moduleExports;
assert.equal(AG_SEC_FACTS_VERSION, "ag-sec-facts-v1");
const input = {
  symbol: "MSFT", cik: "0000789019",
  accessionNumber: "0000789019-26-000099",
  filedDate: "2026-07-29", fiscalEnd: "2026-06-30",
  vendorRevenue: 331839000000,
  vendorOperatingIncome: 149000000000,
  vendorNetIncome: 121000000000,
};
function fact(val, changes={}) {
  return { start:"2025-07-01", end:"2026-06-30", filed:"2026-07-29",
    form:"10-K", accn:"0000789019-26-000099", val, ...changes };
}
function companyFacts(rev=331839000000) {
  return { cik:789019, facts: {"us-gaap": {
    RevenueFromContractWithCustomerExcludingAssessedTax: { units:{USD:[fact(rev)]} },
    OperatingIncomeLoss: {units:{USD:[fact(149000000000)]}},
    NetIncomeLoss: {units:{USD:[fact(121000000000)]}},
  }}};
}
const captured = "2026-11-04T17:00:00.000Z";
const good = reconcileCompanyFacts(input, companyFacts(), captured);
assert.equal(good.result, "MATCH");
assert.equal(good.metrics.length, 3);
assert.equal(good.metrics[0].secAccession, input.accessionNumber);
assert.equal(good.metrics[0].secStart, "2025-07-01");
assert.equal(good.metrics[0].status, "MATCH");
assert.equal(reconcileCompanyFacts(input, companyFacts(330000000000), captured).result, "NEEDS_REVIEW");
const laterFiling = companyFacts();
laterFiling.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD =
  [fact(400000000000, { accn:"0000789019-27-000111", filed:"2027-07-29" })];
assert.equal(reconcileCompanyFacts(input, laterFiling, captured).metrics[0].status, "MISSING_SEC");
const quarter = companyFacts();
quarter.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD =
  [fact(331839000000, { start:"2026-04-01" })];
assert.equal(reconcileCompanyFacts(input, quarter, captured).metrics[0].status, "MISSING_SEC");
const wrongFiling = companyFacts();
wrongFiling.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD =
  [fact(331839000000, { accn:"0000789019-26-000098" })];
assert.equal(reconcileCompanyFacts(input, wrongFiling, captured).metrics[0].status, "MISSING_SEC");
const conflicting = companyFacts();
conflicting.facts["us-gaap"].Revenues = {units:{USD:[fact(330000000000)]}};
assert.equal(reconcileCompanyFacts(input, conflicting, captured).metrics[0].status, "AMBIGUOUS_SEC");
assert.equal(reconcileCompanyFacts({...input, vendorNetIncome:null}, companyFacts(), captured).metrics[2].status, "MISSING_VENDOR");
assert.throws(() => reconcileCompanyFacts(input, {...companyFacts(), cik:320193}, captured));
assert.throws(() => reconcileCompanyFacts(input, companyFacts(), "2026-01-01T00:00:00Z"));
assert.match(route, /db\.auth\.getUser\(\)/);
assert.match(route, /\.eq\("user_id", user\.id\)/);
assert.match(route, /\.eq\("scoring_version", AG_SEC_FACTS_VERSION\)/);
assert.match(route, /sourceSecScanId/);
assert.match(route, /ag_facts_claimed/);
assert.match(route, /"NEEDS_REVIEW"/);
assert.match(route, /executionEnabled: false, transactionsWritten: false/);
assert.doesNotMatch(route, /\.from\(["'](?:transactions|investment_decisions|portfolios)["']\)|executeTransactions|getOpenAIClient|\.delete\(/);
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
assert.match(sql, /scoring_version = 'ag-sec-facts-v1'/);
assert.match(sql, /portfolio_type = 'paper_active'/);
assert.doesNotMatch(sql, /\b(?:DROP|DELETE|TRUNCATE|ALTER TABLE)\b/i);
console.log("AG SEC facts exact accession/period, conflict and isolation tests passed.");
