const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, requireFn=()=>{throw Error("unexpected import")}) {
 const source=fs.readFileSync(path,"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{
   module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
 }}).outputText;
 const exports={};
 vm.runInNewContext(compiled,{exports,require:requireFn});
 return exports;
}
const kernel=load("lib/discovery/accelerated-growth/economics-kernel.ts");
const triage=load("lib/discovery/accelerated-growth/economic-frontier-triage.ts",
  name=>{assert.equal(name,"./economics-kernel");return kernel;});
const {assessAgScenarioEconomics}=kernel;
const {triageAgEconomicHypotheses}=triage;
const rationale={
 economicMechanism:"The hypothetical issuer sustains its illustrated normalized cash generation.",
 evidenceOrAssumption:"Synthetic assumptions for comparative mechanics only, not observed investment data.",
 invalidationCondition:"The issuer fails to deliver the assumed terminal economics.",
 terminalNetDebtUsd:0,terminalDilutedShares:100000000,
};
const base={
 symbol:"CASEA",asOf:"2026-11-06",priceUsd:40,
 quoteCapturedAt:"2026-11-05T20:00:00.000Z",
 quoteEvidenceRef:"Fixed synthetic test quote for controlled mechanical validation.",
 reconciledFactsRef:"Fixed synthetic financial-reconciliation reference for tests only.",
 factReconciliation:"MATCH",thesisPath:"valuation_dislocation",
 thesis:"A hypothetical value realization based on modeled cash generation.",
 thesisCounterEvidence:"The business could lose customers and sustainably weaken cash flow.",
 valueRealizationMechanism:"Operating results support higher future cash flow and justified multiples.",
 horizonYears:3,
 scenarios:{
  adverse:{...rationale,annualUnleveredFcfUsd:200e6,terminalEvToFcf:10},
  base:{...rationale,annualUnleveredFcfUsd:400e6,terminalEvToFcf:15},
  favorable:{...rationale,annualUnleveredFcfUsd:500e6,terminalEvToFcf:16},
 },
};
const caseAt=(symbol,price,extra={})=>{
 const economics=assessAgScenarioEconomics({...base,...extra,symbol,priceUsd:price});
 return {
  hypothesisId:"hypothesis-"+symbol+"-demo",
  symbol,path:economics.thesisPath,
  evidenceNotes:"Synthetic assumptions with an explicit audit trail; no real market evidence.",
  counterEvidence:"Potential modeled cash flow deterioration undermines projected equity.",
  realizationMechanism:"Hypothetical earnings re-rating at fixed enterprise economics.",
  scenarioAssumptionsRef:"scenario-fixture-for-"+symbol+"-validation",
  economics,
 };
};
const cheap=caseAt("CHEAP",30);
const fair=caseAt("FAIR",60);
const expensive=caseAt("EXPENSIVE",90);
const policy={asOf:"2026-11-06",maxQuoteAgeDays:7};
const r=triageAgEconomicHypotheses([expensive,cheap,fair],policy);
assert.equal(r.candidatesSeen,3);
assert.equal(r.hypothesesCompared,3);
assert.equal(r.hypothesesWithEvidenceGaps,0);
assert.equal(r.decisionsIssued,0);
assert.equal(r.tradesEnabled,false);
assert.equal(r.frontiers.length,3);
assert.equal(r.frontiers[0][0],cheap.hypothesisId);
assert.equal(r.frontiers[1][0],fair.hypothesisId);
assert.equal(r.frontiers[2][0],expensive.hypothesisId);
assert.equal(r.entries[1].researchStatus,"FRONTIER_RESEARCH");
assert.equal(r.entries[0].researchStatus,"DOMINATED_RESEARCH");
assert.equal(r.pathCoverage.valuation_dislocation,3);
assert.equal(r.pathCoverage.turnaround,0);
// A higher-upside/higher-downside hypothesis is deliberately incomparable.
const turnaround=caseAt("RECOVERY",40,{
 thesisPath:"turnaround",
 scenarios:{
  adverse:{...rationale,annualUnleveredFcfUsd:100e6,terminalEvToFcf:10},
  base:{...rationale,annualUnleveredFcfUsd:400e6,terminalEvToFcf:15},
  favorable:{...rationale,annualUnleveredFcfUsd:900e6,terminalEvToFcf:16},
 },
});
const tradeOff=triageAgEconomicHypotheses([cheap,turnaround],policy);
assert.equal(tradeOff.frontiers.length,1);
assert.equal(tradeOff.frontiers[0].length,2);
assert.equal(tradeOff.pathCoverage.turnaround,1);
// All charter paths are accepted without a path reservation or quota.
const paths=["accelerating_fundamentals","emerging_opportunity","turnaround",
  "catalyst_driven","valuation_dislocation"];
const varied=paths.map((p,i)=>caseAt("PATH"+i,40,{thesisPath:p}));
const many=triageAgEconomicHypotheses(varied,policy);
assert.equal(many.frontiers[0].length,5);
assert.equal(many.hypothesesCompared,5);
// A missing critical price/source or stale quote is not ranked as evidence.
const stale=caseAt("STALE",40,{quoteCapturedAt:"2026-09-01T20:00:00Z"});
const missing={...caseAt("MISSING",40),economics:null};
const gaps=triageAgEconomicHypotheses([stale,missing,cheap],policy);
assert.equal(gaps.hypothesesWithEvidenceGaps,2);
assert.equal(gaps.hypothesesCompared,1);
assert.equal(gaps.entries[0].researchStatus,"EVIDENCE_REQUIRED");
assert.equal(gaps.entries[0].priceUsd,null);
assert.equal(gaps.entries[1].frontierTier,null);
assert.throws(()=>triageAgEconomicHypotheses([cheap,cheap],policy));
const duplicatePath={...caseAt("CHEAP",60),hypothesisId:"another-hypothesis-same-symbol"};
assert.throws(()=>triageAgEconomicHypotheses([cheap,duplicatePath],policy));
const poisoned=structuredClone(cheap);
poisoned.economics.outcomes.base.simpleReturn=100;
assert.equal(triageAgEconomicHypotheses([poisoned],policy).hypothesesCompared,0);
assert.throws(()=>triageAgEconomicHypotheses([cheap],{asOf:"2026-11-06",maxQuoteAgeDays:90}));
assert.throws(()=>triageAgEconomicHypotheses([],policy));
const source=fs.readFileSync("lib/discovery/accelerated-growth/economic-frontier-triage.ts","utf8");
assert.doesNotMatch(source,/\.from\(["'](?:portfolios|transactions|investment_decisions)["']\)|fetch\(|getOpenAIClient|executeTransactions/);
console.log("Charter economic-frontier comparison, cross-path coverage and price-sensitivity checks passed.");
