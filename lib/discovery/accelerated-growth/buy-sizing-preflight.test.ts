import { strict as assert } from "node:assert";
import { previewAgBuySizing, type AgBuySizingPreflightInput } from "./buy-sizing-preflight";

const baseline: AgBuySizingPreflightInput = {
  portfolioType: "paper_active", isRealMoney: false,
  strategyKey: "accelerated_growth", executionMode: "paper", eraOpen: true,
  decisionType: "buy", decisionSource: "ai_committee", decisionStatus: "active",
  decisionAlreadyExecuted: false, decisionWithinEra: true,
  evidenceVersionValid: true, themeAttributionValid: true,
  referenceTotalCapital: 200, availableCash: 40, currentAgMarketValue: 0,
  currentPositionMarketValue: 0, currentThemeMarketValue: 0,
  sleeveDrawdownPct: 0, price: 200.325, liquidityEligible: true, thesisValid: true,
};
const run = (changes: Partial<AgBuySizingPreflightInput> = {}) => previewAgBuySizing({ ...baseline, ...changes });

const initial = run();
assert.equal(initial.mode, "read_only");
assert.equal(initial.eligible, true);
assert.equal(initial.sizing?.action, "START");
assert.equal(initial.sizing?.constraints.sleeveCap, 40);
assert.equal(initial.sizing?.constraints.positionCap, 10);
assert.equal(initial.sizing?.constraints.themeCap, 20);
assert.equal(initial.sizing?.quantity, 0.025); // 3-decimal, $5.008125 before money rounding

assert.equal(run({ availableCash: 4 }).eligible, false);
assert.match(run({ availableCash: 4 }).reasons.join(" "), /cash/i);
assert.equal(run({ liquidityEligible: false }).eligible, false);
assert.match(run({ liquidityEligible: false }).reasons.join(" "), /liquidity/i);
assert.equal(run({ currentThemeMarketValue: 19 }).eligible, false);
assert.equal(run({ currentAgMarketValue: 39 }).eligible, false);
assert.equal(run({ sleeveDrawdownPct: 20 }).eligible, false);
assert.equal(run({ currentPositionMarketValue: 10 }).eligible, false);
assert.equal(run({ decisionAlreadyExecuted: true }).eligible, false);
assert.equal(run({ decisionStatus: "superseded" }).eligible, false);
assert.equal(run({ decisionType: "watch" }).eligible, false);
assert.equal(run({ evidenceVersionValid: false }).eligible, false);
assert.equal(run({ themeAttributionValid: false }).eligible, false);
assert.equal(run({ decisionWithinEra: false }).eligible, false);
assert.equal(run({ portfolioType: "real", isRealMoney: true }).eligible, false);
assert.equal(run({ portfolioType: "paper_active", isRealMoney: true }).eligible, false);
assert.equal(run({ executionMode: "real" }).eligible, false);
assert.equal(run({ strategyKey: "long_term" }).eligible, false);
assert.equal(run({ eraOpen: false }).eligible, false);
assert.equal(run({ price: Number.NaN }).eligible, false);
assert.equal(run({ currentAgMarketValue: -1 }).eligible, false);
assert.equal(run({ currentPositionMarketValue: 2 }).eligible, false); // ADD requires reassessment
assert.equal(run({ currentPositionMarketValue: 2, reassessmentComplete: true }).eligible, true);

console.log("AG pure sizing preflight fixtures passed");
