// Synthetic, explicitly hypothetical fixtures: NOT real quotes or company forecasts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const src = fs.readFileSync("lib/discovery/accelerated-growth/economics-kernel.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
vm.runInNewContext(compiled, { exports: moduleExports });
const { assessAgScenarioEconomics, AG_ECONOMICS_KERNEL_VERSION } = moduleExports;
assert.equal(AG_ECONOMICS_KERNEL_VERSION, "ag-economics-kernel-v1");

const common = {
  economicMechanism: "Illustrative terminal free cash flow is realized through improved economics.",
  evidenceOrAssumption: "Hypothetical assumption requiring source verification, not an observed fact.",
  invalidationCondition: "Cash conversion or the assumed terminal enterprise multiple fails.",
  terminalNetDebtUsd: 0,
  terminalDilutedShares: 100_000_000,
};
const input = {
  symbol: "TEST",
  asOf: "2026-11-05",
  priceUsd: 40,
  quoteCapturedAt: "2026-11-04T20:00:00Z",
  quoteEvidenceRef: "Hypothetical test-only quote source; no real market quote is claimed.",
  reconciledFactsRef: "Hypothetical test-only reconciliation; not a live SEC statement.",
  factReconciliation: "MATCH",
  thesisPath: "valuation_dislocation",
  thesis: "Hypothetical mispricing with a testable value-realization mechanism.",
  thesisCounterEvidence: "The business might experience significant permanent cash flow erosion.",
  valueRealizationMechanism: "Market recognizes repeatable unlevered cash flow and pays a fair terminal multiple.",
  horizonYears: 3,
  scenarios: {
    adverse: { ...common, annualUnleveredFcfUsd: 200_000_000, terminalEvToFcf: 10 },
    base: { ...common, annualUnleveredFcfUsd: 400_000_000, terminalEvToFcf: 15 },
    favorable: { ...common, annualUnleveredFcfUsd: 500_000_000, terminalEvToFcf: 16 },
  },
};
function run(p) { return assessAgScenarioEconomics(p); }
const lower = run(input);
assert.equal(lower.outcomes.adverse.impliedPriceUsd, 20);
assert.equal(lower.outcomes.base.impliedPriceUsd, 60);
assert.equal(lower.outcomes.favorable.impliedPriceUsd, 80);
assert.equal(lower.outcomes.adverse.simpleReturn, -0.5);
assert.equal(lower.outcomes.favorable.simpleReturn, 1);
assert.equal(lower.upsideVsDownside, 2);
assert.equal(lower.recommendation, null);
assert.equal(lower.executionEnabled, false);
assert.equal(lower.positionSizingEnabled, false);

// Keeping identical business outcomes while increasing purchase price must
// worsen future return and upside/downside. No investment path gets quota slots.
const higher = run({ ...input, priceUsd: 60 });
assert.equal(higher.outcomes.favorable.impliedPriceUsd, 80);
assert.ok(higher.outcomes.base.simpleReturn < lower.outcomes.base.simpleReturn);
assert.ok(higher.upsideVsDownside < lower.upsideVsDownside);
assert.ok(Math.abs(higher.outcomes.adverse.simpleReturn - (-2/3)) < 1e-12);
for (const thesisPath of [
  "accelerating_fundamentals", "emerging_opportunity", "turnaround",
  "catalyst_driven", "valuation_dislocation",
]) assert.equal(run({ ...input, thesisPath }).thesisPath, thesisPath);

const insolvent = structuredClone(input);
insolvent.scenarios.adverse.terminalNetDebtUsd = 4_000_000_000;
const adverseLoss = run(insolvent);
assert.equal(adverseLoss.outcomes.adverse.impliedPriceUsd, 0);
assert.equal(adverseLoss.outcomes.adverse.simpleReturn, -1);
assert.throws(() => run({ ...input, priceUsd: 0 }));
assert.throws(() => run({ ...input, factReconciliation: "NEEDS_REVIEW" }));
assert.throws(() => run({ ...input, asOf:"2026-11-03" }));
assert.throws(() => run({ ...input, horizonYears:0 }));
assert.throws(() => run({ ...input, horizonYears:11 }));
assert.throws(() => run({ ...input, thesisPath:"none" }));
assert.throws(() => run({ ...input, thesisCounterEvidence:"" }));
const wrong = structuredClone(input);
wrong.scenarios.base.annualUnleveredFcfUsd = -1;
assert.throws(() => run(wrong));
const unordered = structuredClone(input);
unordered.scenarios.favorable.annualUnleveredFcfUsd = 100_000_000;
assert.throws(() => run(unordered));
const missingRationale = structuredClone(input);
missingRationale.scenarios.base.invalidationCondition = "";
assert.throws(() => run(missingRationale));
assert.doesNotMatch(src, /\.from\(["'](?:transactions|portfolios|investment_decisions)["']\)|fetch\(|getOpenAIClient|executeTransactions/);
console.log("AG charter scenario economics and price-sensitivity tests passed.");
