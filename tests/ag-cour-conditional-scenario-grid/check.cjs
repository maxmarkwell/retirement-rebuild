const assert=require("node:assert/strict"),fs=require("node:fs"),
 vm=require("node:vm"),ts=require("typescript");
const src=fs.readFileSync("lib/discovery/accelerated-growth/cour-conditional-scenario-grid.ts","utf8");
const js=ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const mod={};vm.runInNewContext(js,{exports:mod});
const fn=mod.assessAgConditionalScenarioGrid;
assert.equal(mod.AG_CONDITIONAL_GRID_VERSION,"ag-cour-conditional-grid-v1");
const input={
 symbol:"COUR",asOf:"2026-11-08",quoteDate:"2026-11-06",quoteUsd:3.74,
 quoteSourceUrl:"https://stockanalysis.com/stocks/cour/history/",
 filingDate:"2026-10-29",
 filingSourceUrl:"https://www.sec.gov/Archives/edgar/data/1651562/000165156226000072/cour-20260930.htm",
 currentBasicShares:253300000,currentLiquidAssetsUsd:775500000,
 currentDeferredRevenueUsd:461700000,currentReportedNineMonthFcfUsd:-25000000,
 currentNineMonthStockCompensationUsd:83000000,managementSynergyTargetAnnualUsd:115000000,
 horizonYears:3,sensitivityPricesUsd:[2.74,3.74,4.74],
 scenarios:[
  {id:"adverse",sustainableAnnualFcfUsdHypothesis:15000000,
   enterpriseToFcfMultipleHypothesis:8,terminalExcessNetCashUsdHypothesis:75000000,
   terminalDilutedSharesHypothesis:330000000,
   economicMechanism:"Weak merger cash conversion with operating losses and dilution.",
   evidenceGap:"Projected owner cash and excess net cash are not independently verified.",
   invalidationCondition:"Significant recurring positive cash conversion contradicts the stress case."},
  {id:"base",sustainableAnnualFcfUsdHypothesis:65000000,
   enterpriseToFcfMultipleHypothesis:12,terminalExcessNetCashUsdHypothesis:300000000,
   terminalDilutedSharesHypothesis:290000000,
   economicMechanism:"Some cost benefits flow through with moderate recurring cash generation.",
   evidenceGap:"We have not verified future owner cash generation or terminal dilution.",
   invalidationCondition:"Persistently negative cash flow would falsify this assumed recovery."},
  {id:"favorable",sustainableAnnualFcfUsdHypothesis:130000000,
   enterpriseToFcfMultipleHypothesis:15,terminalExcessNetCashUsdHypothesis:450000000,
   terminalDilutedSharesHypothesis:270000000,
   economicMechanism:"Synergies result in durable positive FCF and customer retention.",
   evidenceGap:"Unrealized synergies are not verified FCF or distributable equity cash.",
   invalidationCondition:"Loss of enterprise customers undermines assumed margin expansion."},
 ],
};
const r=fn(input);
assert.equal(r.result,"CONDITIONAL_PRICE_SENSITIVITY_NOT_DECISION_GRADE");
assert.equal(r.quoteUsd,3.74);
assert.equal(r.baselineOutcomes.length,3);
assert.equal(r.priceSensitivity.length,3);
assert.ok(Math.abs(r.baselineOutcomes[0].terminalPriceUsd-195000000/330000000)<1e-9);
assert.ok(Math.abs(r.baselineOutcomes[1].terminalPriceUsd-1080000000/290000000)<1e-9);
assert.ok(Math.abs(r.baselineOutcomes[2].terminalPriceUsd-2400000000/270000000)<1e-9);
assert.ok(r.baselineOutcomes[0].totalReturnPct<-80);
assert.ok(r.baselineOutcomes[1].totalReturnPct<0);
assert.ok(r.baselineOutcomes[2].totalReturnPct>100);
assert.ok(r.priceSensitivity[0].outcomes[1].totalReturnPct>
 r.priceSensitivity[2].outcomes[1].totalReturnPct);
assert.equal(r.priceSensitivity[0].outcomes[1].terminalPriceUsd,
 r.priceSensitivity[2].outcomes[1].terminalPriceUsd);
assert.equal(r.committeeDecision,null);
assert.equal(r.recommendation,null);
assert.equal(r.executionEnabled,false);
assert.equal(r.transactionsWritten,false);
assert.equal(r.normalizedPostmergerFcfIndependentlyReconciled,false);
assert.equal(r.terminalNetCashIndependentlyReconciled,false);
assert.equal(r.terminalDilutionIndependentlyVerified,false);
assert.throws(()=>fn({...input,quoteDate:"2026-11-09"}));
assert.throws(()=>fn({...input,filingDate:"2026-11-09"}));
assert.throws(()=>fn({...input,sensitivityPricesUsd:[3.74,3.74,4.74]}));
assert.throws(()=>fn({...input,scenarios:[
 input.scenarios[0],{...input.scenarios[1],sustainableAnnualFcfUsdHypothesis:-1},input.scenarios[2],
]}));
assert.throws(()=>fn({...input,scenarios:[
 input.scenarios[0],{...input.scenarios[1],terminalDilutedSharesHypothesis:0},input.scenarios[2],
]}));
assert.throws(()=>fn({...input,scenarios:[
 input.scenarios[2],input.scenarios[1],input.scenarios[0],
]}));
const route=fs.readFileSync("app/api/accelerated-growth/cour-conditional-price-scenarios/route.ts","utf8");
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/ILLUSTRATIVE_TERMINAL_MULTIPLE_EXCESS_CASH_NO_INTERIM_CASHFLOW/);
assert.match(route,/committeeDecisionsIssued:0/);
assert.match(route,/sec2026IncomeCashBalanceReconciledByXbrl:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions|getOpenAIClient/);
console.log("COUR hypothetical scenarios, price sensitivity, adverse losses and nonrecommendation boundary passed.");
