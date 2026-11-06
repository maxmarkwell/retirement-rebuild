const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source=fs.readFileSync("lib/discovery/accelerated-growth/financial-inflection-signals.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const mod={};vm.runInNewContext(compiled,{exports:mod});
const {inspectAgFinancialInflections,AG_FINANCIAL_INFLECTION_VERSION}=mod;
assert.equal(AG_FINANCIAL_INFLECTION_VERSION,"ag-financial-inflection-v1");
const years=[
  ["2023-07-01","2024-06-30","2024-08-15"],
  ["2024-07-01","2025-06-30","2025-08-15"],
  ["2025-07-01","2026-06-30","2026-08-15"],
];
function annual(data) {
 return years.map(([fiscalStart,fiscalEnd,filedDate],i)=>({
  symbol:"DEMO",fiscalStart,fiscalEnd,filedDate,
  sourceRef:"Synthetic audited fiscal source for "+fiscalEnd,
  revenueUsd:data.revenue[i],
  operatingIncomeUsd:data.operatingIncome[i],
  netIncomeUsd:0,
  operatingCashFlowUsd:data.operatingCashFlow[i],
  capitalExpendituresUsd:data.capex[i],
 }));
}
const asOf="2026-11-06";
const evidence=annual({
 revenue:[100e6,110e6,140e6],
 operatingIncome:[-5e6,-1e6,20e6],
 operatingCashFlow:[10e6,7e6,25e6],
 capex:[9e6,12e6,8e6],
});
const r=inspectAgFinancialInflections(evidence,asOf);
assert.equal(r.signals.length,4);
assert.equal(r.signals.filter(x=>x.path==="accelerating_fundamentals").length,2);
assert.equal(r.signals.filter(x=>x.path==="turnaround").length,2);
assert.equal(r.pathReadiness.emerging_opportunity,"REQUIRES_EXTERNAL_EVIDENCE");
assert.equal(r.pathReadiness.catalyst_driven,"REQUIRES_EXTERNAL_EVIDENCE");
assert.equal(r.pathReadiness.valuation_dislocation,"REQUIRES_PRICE_AND_VALUE");
assert.equal(r.economicRankingPerformed,false);
assert.equal(r.executionEnabled,false);
assert.equal(r.recommendation,null);
assert.equal(r.observations.latestCashFlowProxyUsd,17e6);
assert.ok(r.observations.revenueGrowthAccelerationPp>17);
assert.equal(r.signals[0].evidenceRefs.length,3);
const noGrowth=annual({
 revenue:[100e6,95e6,90e6],
 operatingIncome:[10e6,8e6,5e6],
 operatingCashFlow:[20e6,19e6,18e6],
 capex:[5e6,5e6,5e6],
});
const declined=inspectAgFinancialInflections(noGrowth,asOf);
assert.equal(declined.signals.length,0);
assert.equal(declined.pathReadiness.turnaround,"NO_SIGNAL_OR_INCOMPLETE");
assert.equal(declined.pathReadiness.emerging_opportunity,"REQUIRES_EXTERNAL_EVIDENCE");
const missing=structuredClone(evidence);
missing[1].revenueUsd=null;missing[2].capitalExpendituresUsd=null;
const incomplete=inspectAgFinancialInflections(missing,asOf);
assert.equal(incomplete.observations.revenueGrowthAccelerationPp,null);
assert.equal(incomplete.observations.latestCashFlowProxyUsd,null);
assert.ok(incomplete.missing.includes("THREE_YEAR_COMPARABLE_REVENUE"));
assert.ok(incomplete.missing.includes("TWO_YEAR_OPERATING_CASH_FLOW_AND_CAPEX"));
const future=structuredClone(evidence);future[2].filedDate="2026-12-01";
assert.throws(()=>inspectAgFinancialInflections(future,asOf));
const wrongIssuer=structuredClone(evidence);wrongIssuer[1].symbol="OTHER";
assert.throws(()=>inspectAgFinancialInflections(wrongIssuer,asOf));
const unsorted=[evidence[1],evidence[0],evidence[2]];
assert.throws(()=>inspectAgFinancialInflections(unsorted,asOf));
const badPeriod=structuredClone(evidence);badPeriod[2].fiscalStart="2026-04-01";
assert.throws(()=>inspectAgFinancialInflections(badPeriod,asOf));
const invalidCapex=structuredClone(evidence);invalidCapex[2].capitalExpendituresUsd=-10;
assert.throws(()=>inspectAgFinancialInflections(invalidCapex,asOf));
const noSource=structuredClone(evidence);noSource[1].sourceRef="";
assert.throws(()=>inspectAgFinancialInflections(noSource,asOf));
assert.doesNotMatch(source,/\.from\(["'](?:transactions|portfolios|investment_decisions)["']\)|fetch\(|getOpenAIClient|executeTransactions/);
console.log("AG financial inflection, turnaround, missing data, provenance and paper-only tests passed.");
