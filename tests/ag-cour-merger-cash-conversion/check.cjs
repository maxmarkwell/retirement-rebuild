const assert=require("node:assert/strict"),fs=require("node:fs"),
 vm=require("node:vm"),ts=require("typescript");
const path="lib/discovery/accelerated-growth/merger-cash-conversion.ts";
const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const mod={};vm.runInNewContext(code,{exports:mod});
const assess=mod.assessAgMergerCashConversion;
const q2="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000059/cour-20260630xshareholde.htm";
const q3="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000068/cour-20260930xshareholde.htm";
const input={
 symbol:"COUR",asOf:"2026-11-07",
 quarterly:[
  {quarterEnd:"2026-06-30",cfoUsd:-19800000,reportedFcfUsd:-32600000,
   integrationCashPaymentsUsd:39100000,severanceCashPaymentsUsd:18100000,
   adjustedEbitdaUsd:42700000,sourceUrl:q2},
  {quarterEnd:"2026-09-30",cfoUsd:15500000,reportedFcfUsd:4600000,
   integrationCashPaymentsUsd:6700000,severanceCashPaymentsUsd:21000000,
   adjustedEbitdaUsd:61500000,sourceUrl:q3},
 ],
 sixMonthCfoUsd:-5200000,sixMonthFcfUsd:-29600000,
 nineMonthCfoUsd:10300000,nineMonthFcfUsd:-25000000,
 nineMonthSbcUsd:83000000,nineMonthCapexContentSoftwareUsd:35300000,
 nineMonthIntegrationCashPaymentsUsd:56900000,
 nineMonthSeveranceCashPaymentsUsd:39100000,
 nineMonthEvidenceUrl:q3,managementAnnualNetSynergyTargetUsd:115000000,
 synergySourceUrl:q3,
};
const r=assess(input);
assert.equal(r.version,"ag-post-merger-cash-conversion-v1");
assert.equal(r.quarters[0].disclosedMergerCashPaymentsUsd,57200000);
assert.equal(r.quarters[1].disclosedMergerCashPaymentsUsd,27700000);
assert.equal(r.quarters[0].cashInvestmentUsd,12800000);
assert.equal(r.quarters[1].cashInvestmentUsd,10900000);
assert.equal(r.quarters[0].sensitivity[0].hypotheticalFcfUsd,-32600000);
assert.equal(r.quarters[0].sensitivity[2].hypotheticalFcfUsd,24600000);
assert.equal(r.quarters[1].sensitivity[2].hypotheticalFcfUsd,32300000);
assert.equal(r.q2ToQ3ReportedFcfChangeUsd,37200000);
assert.equal(r.q2ToQ3FullAddbackFcfChangeUsd,7700000);
assert.equal(r.nineMonth.disclosedMergerCashPaymentsUsd,96000000);
assert.equal(r.nineMonth.fcfAfterFullHypotheticalAddbackUsd,71000000);
assert.equal(r.nineMonth.reportedFcfUsd,-25000000);
assert.equal(r.nineMonth.stockCompensationUsd,83000000);
assert.equal(r.managementNetAnnualSynergyTargetUsd,115000000);
assert.equal(r.synergyRealizedCashEvidence,"NOT_VERIFIED");
assert.equal(r.normalizedAnnualOwnerFcfUsd,null);
assert.equal(r.priceScenarioReady,false);
assert.equal(r.recommendation,null);
assert.equal(r.executionEnabled,false);
assert.equal(r.transactionsWritten,false);
assert.throws(()=>assess({...input,nineMonthFcfUsd:-15000000}));
assert.throws(()=>assess({...input,sixMonthFcfUsd:-15000000}));
assert.throws(()=>assess({...input,quarterly:[
 input.quarterly[0],{...input.quarterly[1],quarterEnd:"2026-12-31"}]}));
assert.throws(()=>assess({...input,quarterly:[
 input.quarterly[0],{...input.quarterly[1],severanceCashPaymentsUsd:-1}]}));
assert.throws(()=>assess({...input,nineMonthSeveranceCashPaymentsUsd:5000000}));
const route=fs.readFileSync("app/api/accelerated-growth/cour-merger-cash-conversion/route.ts","utf8");
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/CURATED_SEC_SUBMITTED_SHAREHOLDER_LETTERS/);
assert.match(route,/cashAdjustmentsAreForecasts:false/);
assert.match(route,/valuationPerformed:false/);
assert.match(route,/persisted:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions|getOpenAIClient/);
console.log("COUR Q2/Q3 cash bridge, nonrecurrence limits, no-synergy-double-count and read-only boundary passed.");
