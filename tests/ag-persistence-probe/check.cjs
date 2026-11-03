const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");

const source = fs.readFileSync("lib/discovery/accelerated-growth/persistence-probe.ts", "utf8");
const route = fs.readFileSync("app/api/accelerated-growth/persistence-probe/route.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261103190000_ag_persistence_probe_active_scan_uniqueness.sql", "utf8");

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports, Set });
const { AG_PERSISTENCE_PROBE_VERSION, normalizeProbeSymbols, readProbeState, nextProbeState } = moduleExports;

assert.equal(AG_PERSISTENCE_PROBE_VERSION, "ag-persistence-probe-v1");
assert.equal(JSON.stringify(normalizeProbeSymbols([" simo ", "pypl"])), '["SIMO","PYPL"]');
assert.throws(() => normalizeProbeSymbols(["ABC","abc"]));
assert.throws(() => normalizeProbeSymbols([]));
assert.throws(() => normalizeProbeSymbols(["../bad"]));
assert.throws(() => normalizeProbeSymbols(["A","B","C","D"]));

const initial = { version: AG_PERSISTENCE_PROBE_VERSION, symbols: ["SIMO","PYPL"],
  cursor: 0, results: [] };
const first = nextProbeState(readProbeState(initial));
assert.equal(first.cursor, 1);
assert.equal(first.results[0].symbol, "SIMO");
assert.equal(first.results[0].ordinal, 0);
const second = nextProbeState(readProbeState(first));
assert.equal(second.cursor, 2);
assert.equal(second.results[1].symbol, "PYPL");
assert.throws(() => nextProbeState(readProbeState(second)));
assert.throws(() => readProbeState({ ...first, cursor: 2 }));
assert.throws(() => readProbeState({ ...first, results: [{ symbol:"PYPL", ordinal:0, result:"MANIFEST_VERIFIED" }] }));
assert.throws(() => readProbeState({ ...first, symbols: ["SIMO","SIMO"] }));

assert.match(route, /db\.auth\.getUser\(\)/);
assert.match(route, /\.eq\("user_id", user\.id\)/);
assert.match(route, /\.eq\("portfolio_type", "paper_active"\)/);
assert.match(route, /\.eq\("scoring_version", AG_PERSISTENCE_PROBE_VERSION\)/);
assert.match(route, /\.eq\("stage", "ag_probe_claimed"\)/);
assert.match(route, /AG_PROBE_REQUIRES_RECONCILIATION/);
assert.match(route, /"Cache-Control": "no-store"/);
assert.match(route, /executionEnabled: false, transactionsWritten: false/);
assert.doesNotMatch(route, /investment_decisions|transactions[."]|executeTransactions|getOpenAIClient|FMP_API_KEY|\.delete\(|\.upsert\(/);
assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS discovery_scan_runs_ag_probe_one_active_per_user/);
assert.match(migration, /scoring_version = 'ag-persistence-probe-v1'/);
assert.match(migration, /portfolio_type = 'paper_active'/);
assert.match(migration, /status IN \('pending', 'running'\)/);
assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE|ALTER TABLE)\b/i);
console.log("AG persistence probe deterministic manifest, fail-closed state, and scope tests passed.");
