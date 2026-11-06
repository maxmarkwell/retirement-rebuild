const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const vm = require("node:vm");
const source=fs.readFileSync("lib/discovery/accelerated-growth/historical-capital-baseline.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={};vm.runInNewContext(compiled,{exports:mod});
const {extractHistoricalCapitalBaseline,AG_HISTORICAL_BASELINE_VERSION}=mod;
assert.equal(AG_HISTORICAL_BASELINE_VERSION,"ag-historical-baseline-v1");
const input={symbol:"TEST",cik:"0000789019",accession:"0001193125-26-323660",filingDate:"2026-07-29",fiscalStart:"2025-07-01",fiscalEnd:"2026-06-30"};
const annual=(val,overrides={})=>({accn:input.accession,form:"10-K",filed:input.filingDate,start:input.fiscalStart,end:input.fiscalEnd,val,...overrides});
const instant=(val,overrides={})=>({accn:input.accession,form:"10-K",filed:input.filingDate,end:input.fiscalEnd,val,...overrides});
const usd=(rows)=>({units:{USD:rows}});
const shares=(rows)=>({units:{shares:rows}});
function sample(){
 return {cik:789019,facts:{"us-gaap":{
  NetCashProvidedByUsedInOperatingActivities:usd([annual(50e9)]),
  PaymentsToAcquirePropertyPlantAndEquipment:usd([annual(12e9)]),
  WeightedAverageNumberOfDilutedSharesOutstanding:shares([annual(7.5e9)]),
  CashAndCashEquivalentsAtCarryingValue:usd([instant(20e9)]),
  LongTermDebtCurrent:usd([instant(3e9)]),
  LongTermDebtNoncurrent:usd([instant(9e9)]),
 }}};
}
const good=extractHistoricalCapitalBaseline(input,sample());
assert.equal(good.historicalLeveredFcfProxyUsd,38e9);
assert.equal(good.narrowReportedNetDebtUsd,-8e9);
assert.equal(good.status,"COMPLETE_NARROW_BASELINE");
assert.equal(good.readyForValuation,false);
assert.equal(good.eligibleAsUnleveredFcfForecast,false);
assert.equal(good.eligibleAsTerminalShareForecast,false);
assert.equal(good.facts.historicalDilutedWeightedAverageShares.unit,"shares");
const later=sample();
later.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities=usd([annual(50e9,{accn:"0001193125-27-999999",filed:"2027-07-29"})]);
assert.equal(extractHistoricalCapitalBaseline(input,later).facts.cashFromOperations.status,"MISSING");
const quarter=sample();
quarter.facts["us-gaap"].NetCashProvidedByUsedInOperatingActivities=usd([annual(10e9,{start:"2026-04-01"})]);
assert.equal(extractHistoricalCapitalBaseline(input,quarter).historicalLeveredFcfProxyUsd,null);
const ambiguity=sample();
ambiguity.facts["us-gaap"].LongTermDebtCurrent=usd([instant(3e9),instant(4e9)]);
assert.equal(extractHistoricalCapitalBaseline(input,ambiguity).facts.currentLongTermDebt.status,"AMBIGUOUS");
assert.equal(extractHistoricalCapitalBaseline(input,ambiguity).narrowReportedNetDebtUsd,null);
const missingDebt=sample();
delete missingDebt.facts["us-gaap"].LongTermDebtNoncurrent;
assert.equal(extractHistoricalCapitalBaseline(input,missingDebt).status,"INCOMPLETE_OR_AMBIGUOUS");
assert.equal(extractHistoricalCapitalBaseline(input,missingDebt).narrowReportedNetDebtUsd,null);
const negativeCapex=sample();
negativeCapex.facts["us-gaap"].PaymentsToAcquirePropertyPlantAndEquipment=usd([annual(-1e9)]);
assert.equal(extractHistoricalCapitalBaseline(input,negativeCapex).historicalLeveredFcfProxyUsd,null);
assert.throws(()=>extractHistoricalCapitalBaseline(input,{...sample(),cik:12345}));
assert.throws(()=>extractHistoricalCapitalBaseline({...input,fiscalStart:"2026-04-01"},sample()));
assert.doesNotMatch(source,/getOpenAIClient|\.from\(["'](?:portfolios|transactions|investment_decisions)["']\)|executeTransactions|\bBUY\s*:/);
console.log("Historical SEC evidence extraction, source-date and non-forecast gates passed.");
