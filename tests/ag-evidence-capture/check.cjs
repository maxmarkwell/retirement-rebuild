const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("lib/discovery/accelerated-growth/evidence-capture.ts", "utf8");
const route = fs.readFileSync("app/api/accelerated-growth/evidence-capture/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261104090000_ag_evidence_capture_active_uniqueness.sql", "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(transpiled, { exports: moduleExports, require: () => ({}), URL, AbortSignal });
const { validateEvidence, VERSION } = moduleExports;
assert.equal(VERSION, "ag-evidence-capture-v1");
const p = { symbol: "MSFT", companyName: "Microsoft Corporation", exchangeShortName: "NASDAQ", currency: "USD" };
const q = { symbol: "MSFT", price: 410, marketCap: 3e12, exchangeShortName: "NASDAQ", currency: "USD" };
const f = { symbol: "MSFT", date: "2025-06-30", filingDate: "2025-07-30", revenue: 280e9,
  operatingIncome: 125e9, netIncome: 101e9,
  finalLink: "https://www.sec.gov/Archives/edgar/data/789019/example.htm" };
const captured = "2026-11-04T17:00:00.000Z";
const good = validateEvidence("MSFT", p, q, f, captured);
assert.equal(good.identityStatus, "CONSISTENT_VENDOR_ONLY");
assert.equal(good.primaryFilingUrl, f.finalLink);
assert.equal(good.revenue, 280e9);
assert.equal(good.filedDate, "2025-07-30");
assert.deepEqual(Array.from(good.limitations).length, 2);
assert.throws(() => validateEvidence("MSFT", { ...p, symbol: "AAPL" }, q, f, captured));
assert.throws(() => validateEvidence("MSFT", p, { ...q, price: 0 }, f, captured));
assert.throws(() => validateEvidence("MSFT", p, { ...q, currency: "EUR" }, f, captured));
assert.throws(() => validateEvidence("MSFT", p, q, { ...f, filingDate: "2027-01-01" }, captured));
assert.throws(() => validateEvidence("MSFT", p, q, { ...f, revenue: null }, captured));
const unverified = validateEvidence("MSFT", p, q, { ...f, finalLink: "http://evil.example/filing" }, captured);
assert.equal(unverified.primaryFilingUrl, null);
assert.equal(unverified.limitations.length, 3);
assert.match(route, /db\.auth\.getUser\(\)/);
assert.match(route, /\.eq\("user_id", user\.id\)/);
assert.match(route, /\.eq\("portfolio_type", "paper_active"\)/);
assert.match(route, /\.eq\("scoring_version", VERSION\)/);
assert.match(route, /ag_evidence_claimed/);
assert.match(route, /AG_EVIDENCE_REQUIRES_RECONCILIATION/);
assert.match(route, /executionEnabled: false, transactionsWritten: false/);
assert.doesNotMatch(route, /\.from\(["'](?:transactions|investment_decisions|portfolios)["']\)|executeTransactions|getOpenAIClient|\.delete\(/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS/);
assert.match(migration, /scoring_version = 'ag-evidence-capture-v1'/);
assert.match(migration, /portfolio_type = 'paper_active'/);
assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE|ALTER TABLE)\b/i);
console.log("AG one-company real-evidence validation, integrity, and persistence boundaries passed.");
