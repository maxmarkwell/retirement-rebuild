const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const src = fs.readFileSync("lib/discovery/accelerated-growth/sec-issuer-verification.ts", "utf8");
const route = fs.readFileSync("app/api/accelerated-growth/sec-issuer-verification/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261104100000_ag_sec_issuer_active_uniqueness.sql", "utf8");
const stripped = src.replace(/^import "server-only";\s*/m, "");
const js = ts.transpileModule(stripped, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const moduleExports = {};
vm.runInNewContext(js, { exports: moduleExports, URL, AbortSignal, fetch() { throw Error("unexpected fetch"); } });
const { reconcileSecIssuer, SEC_VERIFY_VERSION } = moduleExports;
assert.equal(SEC_VERIFY_VERSION, "ag-sec-issuer-v1");
const input = {
  symbol: "MSFT", vendorIssuerName: "Microsoft Corporation",
  vendorFiscalEnd: "2026-06-30", vendorFilingDate: "2026-07-29",
  vendorCaptureTime: "2026-11-04T16:39:57.094Z",
};
const tickerMap = [{ cik_str: 789019, ticker: "MSFT", title: "MICROSOFT CORP" }];
const submissions = {
  cik: 789019, name: "MICROSOFT CORP", tickers: ["MSFT"],
  filings: { recent: {
    form: ["10-Q", "10-K"], accessionNumber: ["0000789019-26-000010", "0000789019-26-000099"],
    filingDate: ["2026-10-28", "2026-07-29"],
    reportDate: ["2026-09-30", "2026-06-30"],
    primaryDocument: ["quarterly.htm", "msft-20260630.htm"],
  } },
};
const result = reconcileSecIssuer(input, tickerMap, submissions, "2026-11-04T16:42:00Z");
assert.equal(result.cik, "0000789019");
assert.equal(result.verification, "SEC_ISSUER_AND_FILING_METADATA_MATCH");
assert.equal(result.reportDate, "2026-06-30");
assert.equal(result.filingUrl, "https://www.sec.gov/Archives/edgar/data/789019/000078901926000099/msft-20260630.htm");
assert.throws(() => reconcileSecIssuer(input, tickerMap, { ...submissions, cik: 1 }, "2026-11-04T16:42:00Z"));
assert.throws(() => reconcileSecIssuer(input, tickerMap, { ...submissions, name: "ALPHABET INC" }, "2026-11-04T16:42:00Z"));
assert.throws(() => reconcileSecIssuer(input, tickerMap, { ...submissions, tickers: ["AAPL"] }, "2026-11-04T16:42:00Z"));
assert.throws(() => reconcileSecIssuer({ ...input, vendorFilingDate: "2026-07-28" }, tickerMap, submissions, "2026-11-04T16:42:00Z"));
assert.throws(() => reconcileSecIssuer(input, tickerMap.concat(tickerMap), submissions, "2026-11-04T16:42:00Z"));
assert.throws(() => reconcileSecIssuer(input, tickerMap, {
  ...submissions, filings: { recent: { ...submissions.filings.recent,
    primaryDocument: ["quarterly.htm", "../evil.htm"] } },
}, "2026-11-04T16:42:00Z"));
assert.match(route, /db\.auth\.getUser\(\)/);
assert.match(route, /\.eq\("user_id", user\.id\)/);
assert.match(route, /\.eq\("scoring_version", SEC_VERIFY_VERSION\)/);
assert.match(route, /ag_sec_claimed/);
assert.match(route, /AG_SEC_REQUIRES_RECONCILIATION/);
assert.match(route, /executionEnabled: false, transactionsWritten: false/);
assert.doesNotMatch(route, /\.from\(["'](?:transactions|investment_decisions|portfolios)["']\)|executeTransactions|getOpenAIClient|\.delete\(/);
assert.match(migration, /scoring_version = 'ag-sec-issuer-v1'/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE|ALTER TABLE)\b/i);
console.log("SEC issuer, CIK, 10-K metadata, and scoped persistence validation passed.");
