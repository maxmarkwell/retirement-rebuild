const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const corePath="lib/discovery/accelerated-growth/live-financial-signal-batch.ts";
const detectorPath="lib/discovery/accelerated-growth/financial-inflection-signals.ts";
function load(path,requireFn=()=>{throw Error("unexpected require")}) {
 const src=fs.readFileSync(path,"utf8").replace(/^import "server-only";\s*/m,"");
 const code=ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 }}).outputText;
 const exports={};vm.runInNewContext(code,{exports,require:requireFn});
 return exports;
}
const detector=load(detectorPath);
const core=load(corePath,name=>{
 assert.equal(name,"./financial-inflection-signals");return detector;
});
const {inspectLiveAnnualVendorBatch}=core;
const years=[
 {date:"2026-06-30",filingDate:"2026-08-10",revenue:140e6,operatingIncome:20e6,
  netIncome:12e6,operatingCashFlow:25e6,capitalExpenditure:-8e6},
 {date:"2025-06-30",filingDate:"2025-08-10",revenue:110e6,operatingIncome:-1e6,
  netIncome:-4e6,operatingCashFlow:7e6,capitalExpenditure:-12e6},
 {date:"2024-06-30",filingDate:"2024-08-10",revenue:100e6,operatingIncome:-5e6,
  netIncome:-6e6,operatingCashFlow:10e6,capitalExpenditure:-9e6},
 {date:"2023-06-30",filingDate:"2023-08-10",revenue:90e6,operatingIncome:-10e6,
  netIncome:-8e6,operatingCashFlow:7e6,capitalExpenditure:-3e6},
];
const bundle=(symbol,changes={})=>({
 income:years.map(({date,filingDate,revenue,operatingIncome,netIncome})=>({
  symbol,period:"FY",date,filingDate,revenue,operatingIncome,netIncome,
 })),
 cash:years.map(({date,filingDate,operatingCashFlow,capitalExpenditure})=>({
  symbol,period:"FY",date,filingDate,operatingCashFlow,capitalExpenditure,
 })),
 ...changes,
});
const stamp="2026-11-06T17:00:00.000Z",date="2026-11-06";
let result=inspectLiveAnnualVendorBatch(["TEST","VOID"],date,stamp,{
 TEST:bundle("TEST"),VOID:null,
});
assert.equal(result.symbolsRequested,2);
assert.equal(result.symbolsAnalyzed,1);
assert.equal(result.symbolsWithSignals,1);
assert.equal(result.evidenceGaps,1);
assert.equal(result.totalSignals,4);
assert.equal(result.rows[0].report.signals.length,4);
assert.equal(result.rows[0].report.observations.latestCashFlowProxyUsd,17e6);
assert.equal(result.rows[0].report.fiscalEnds[0],"2024-06-30");
assert.equal(result.rows[0].report.fiscalEnds[2],"2026-06-30");
assert.equal(result.rows[0].result,"SIGNALS_PRESENT");
assert.equal(result.rows[1].result,"EVIDENCE_GAP");
assert.equal(result.independentIssuerVerificationPerformed,false);
assert.equal(result.economicRankingPerformed,false);
assert.equal(result.committeeDecisionsIssued,0);
assert.equal(result.executionEnabled,false);
assert.equal(result.transactionsWritten,false);
assert.equal(result.selectionMode,"EXPLICIT_USER_SUPPLIED_SYMBOLS");
const mismatch=bundle("WRONG");
const mixed=bundle("TEST",{income:mismatch.income});
assert.equal(inspectLiveAnnualVendorBatch(["TEST"],date,stamp,{TEST:mixed}).evidenceGaps,1);
const cashFiled=bundle("TEST");
cashFiled.cash[1].filingDate="2025-09-01";
const partial=inspectLiveAnnualVendorBatch(["TEST"],date,stamp,{TEST:cashFiled});
assert.equal(partial.rows[0].result,"SIGNALS_PRESENT");
assert.equal(partial.rows[0].report.observations.previousCashFlowProxyUsd,null);
assert.equal(partial.rows[0].report.observations.latestCashFlowProxyUsd,17e6);
assert.ok(partial.rows[0].report.missing.includes("TWO_YEAR_OPERATING_CASH_FLOW_AND_CAPEX"));
const future=bundle("TEST");
future.income[0].filingDate="2026-12-01";
assert.equal(inspectLiveAnnualVendorBatch(["TEST"],date,stamp,{TEST:future}).evidenceGaps,1);
const duplicate=bundle("TEST");
duplicate.income[1].date=duplicate.income[0].date;
assert.equal(inspectLiveAnnualVendorBatch(["TEST"],date,stamp,{TEST:duplicate}).evidenceGaps,1);
const tooFew=bundle("TEST");
tooFew.income=tooFew.income.slice(0,3);
assert.equal(inspectLiveAnnualVendorBatch(["TEST"],date,stamp,{TEST:tooFew}).evidenceGaps,1);
const unavailable=inspectLiveAnnualVendorBatch(["A"],date,stamp,{});
assert.equal(unavailable.rows[0].missing[0],"PROVIDER_DATA_UNAVAILABLE");
assert.throws(()=>inspectLiveAnnualVendorBatch(["A","A"],date,stamp,{A:bundle("A")}));
assert.throws(()=>inspectLiveAnnualVendorBatch(["A"],date,"2026-11-05T16:00:00Z",{A:bundle("A")}));
assert.throws(()=>inspectLiveAnnualVendorBatch([],date,stamp,{}));
const route=fs.readFileSync("app/api/accelerated-growth/live-financial-signal-batch/route.ts","utf8");
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/AG_BATCH_ORIGIN_INVALID/);
assert.match(route,/proposed\.length>6/);
assert.match(route,/executionEnabled:false,transactionsWritten:false/);
assert.match(route,/persisted:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|getOpenAIClient|executeTransactions/);
console.log("AG FMP annual live batch fiscal alignment, missing evidence, same-origin and isolation tests passed.");
