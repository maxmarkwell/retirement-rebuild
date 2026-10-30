const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source = fs.readFileSync("lib/discovery/accelerated-growth/opportunity-qualification.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports, URL });
const { AG_OPPORTUNITY_PATHS, qualifyAgOpportunity } = exports;
assert.equal(AG_OPPORTUNITY_PATHS.length, 5);
function evidence(path, strength = 80, coverage = 80) {
  return { path, evidence: ["Documented business development"], sourceUrls: ["https://example.com/filing"],
    economicMechanism: "Improved unit economics per share", counterEvidence: ["Material financing and execution risk"],
    invalidation: ["Deterioration in operating results"], evidenceHorizon: "Next four quarterly reports",
    strength, coverage, significance: 70, urgency: 60, uncertainty: 70 };
}
for (const path of AG_OPPORTUNITY_PATHS) {
  const r = qualifyAgOpportunity("ABC", [evidence(path)]);
  assert.equal(r.status, "QUALIFIED");
  assert.deepEqual(Array.from(r.qualifiedPaths), [path]);
  assert.equal(r.strongestPath, path);
}
assert.equal(qualifyAgOpportunity("ABC", [evidence("TURNAROUND", 90, null)]).status, "INSUFFICIENT_EVIDENCE");
assert.equal(qualifyAgOpportunity("ABC", [evidence("VALUATION_DISLOCATION", 55)]).status, "REVIEW");
assert.equal(qualifyAgOpportunity("ABC", []).status, "INSUFFICIENT_EVIDENCE");
assert.throws(() => qualifyAgOpportunity("ABC", [evidence("TURNAROUND"), evidence("TURNAROUND")]));
console.log("All five independent AG opportunity paths and fail-closed qualification verified.");
