const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function load(file,dependency){
 const source=fs.readFileSync(file,"utf8").replace(/^import "server-only";\s*/m,"");
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:()=>dependency});return exports;
}
const detector=load("lib/discovery/accelerated-growth/financial-inflection-signals.ts");
const batch=load("lib/discovery/accelerated-growth/live-financial-signal-batch.ts",detector);
const {inspectAgFinancialInflections}=detector;
const {inspectLiveAnnualVendorBatch,AG_LIVE_SIGNAL_BATCH_VERSION}=batch;
assert.equal(AG_LIVE_SIGNAL_BATCH_VERSION,"ag-live-signal-batch-v2");
const ends=["2023-12-31","2024-12-31","2025-12-31","2026-12-31"];
const filed=["2024-02-10","2025-02-10","2026-02-10","2027-02-10"];
// Test as-of is after last filing; synthetic inputs have no market inference.
const asOf="2027-03-01",timestamp=asOf+"T12:00:00Z";
const rows=ends.map((date,i)=>({symbol:"ZERO",period:"FY",date,filingDate:filed[i],
 revenue:0,operatingIncome:-1000000*(4-i),netIncome:-2000000,
 operatingCashFlow:-10000000,capitalExpenditure:-5000000}));
const income=[...rows].reverse();
const cash=income.map(x=>({symbol:x.symbol,period:"FY",date:x.date,filingDate:x.filingDate,
 operatingCashFlow:x.operatingCashFlow,capitalExpenditure:x.capitalExpenditure}));
const live=inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{income,cash}});
assert.equal(live.evidenceGaps,0);
assert.equal(live.symbolsAnalyzed,1);
assert.equal(live.rows[0].result,"NO_MECHANICAL_SIGNAL");
assert.equal(live.rows[0].evidenceFailureCode,null);
assert.equal(live.rows[0].report.observations.latestRevenueGrowth,null);
assert.equal(live.rows[0].report.observations.operatingMarginChangePp,null);
assert.ok(live.rows[0].report.missing.includes("ZERO_REVENUE_PERIOD_NO_REVENUE_MULTIPLE_OR_MARGIN_INFERENCE"));
assert.equal(live.rows[0].report.pathReadiness.emerging_opportunity,"REQUIRES_EXTERNAL_EVIDENCE");
assert.equal(live.rows[0].report.pathReadiness.catalyst_driven,"REQUIRES_EXTERNAL_EVIDENCE");
assert.equal(live.rows[0].report.recommendation,null);
assert.equal(live.executionEnabled,false);
assert.equal(live.transactionsWritten,false);
const missingRows=inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{
 income:income.slice(0,3),cash
}});
assert.equal(missingRows.evidenceGaps,1);
assert.equal(missingRows.rows[0].evidenceFailureCode,"AG_BATCH_INSUFFICIENT_ANNUAL_ROWS");
const duplicateIncome=income.map(x=>({...x}));duplicateIncome[1].date=duplicateIncome[0].date;
const dup=inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{income:duplicateIncome,cash}});
assert.equal(dup.rows[0].evidenceFailureCode,"AG_BATCH_DUPLICATE_FISCAL_END");
const future=income.map(x=>({...x}));future[0].filingDate="2027-04-01";
const invalidDate=inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{income:future,cash}});
assert.equal(invalidDate.rows[0].evidenceFailureCode,"AG_BATCH_IDENTITY_OR_FILING_MISMATCH");
const negative=income.map(x=>({...x}));negative[0].revenue=-100;
assert.equal(inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{income:negative,cash}}).rows[0].evidenceFailureCode,
 "AG_INFLECTION_INVALID_FINANCIAL_VALUE");
const revenue=income.map(x=>({...x}));revenue[0].revenue=1000000;
const mixed=inspectLiveAnnualVendorBatch(["ZERO"],asOf,timestamp,{ZERO:{income:revenue,cash}});
assert.equal(mixed.evidenceGaps,0);
assert.equal(mixed.rows[0].report.observations.latestRevenueGrowth,null);
const source=fs.readFileSync("lib/discovery/accelerated-growth/live-financial-signal-batch.ts","utf8");
assert.doesNotMatch(source,/\.from\(["'](?:transactions|portfolios|investment_decisions)["']\)|executeTransactions|getOpenAIClient/);
console.log("AG zero-revenue and granular evidence errors pass; no finance writes or false positive signals.");
