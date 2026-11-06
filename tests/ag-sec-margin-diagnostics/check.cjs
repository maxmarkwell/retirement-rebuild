const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function load(path) {
 const src=fs.readFileSync(path,"utf8");
 const js=ts.transpileModule(src,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 }}).outputText;
 const exports={};vm.runInNewContext(js,{exports});return exports;
}
const {diagnoseSecMarginDiscrepancies,AG_SEC_MARGIN_DIAGNOSTICS_VERSION}=load(
 "lib/discovery/accelerated-growth/sec-margin-discrepancy-diagnostics.ts");
assert.equal(AG_SEC_MARGIN_DIAGNOSTICS_VERSION,"ag-sec-margin-diagnostics-v1");
const accession1="0000001234-25-000001",accession2="0000001234-26-000002";
const check={
 symbol:"DEMO",verdict:"NEEDS_REVIEW",
 years:[
  {fiscalEnd:"2024-12-31",filedDate:"2025-02-10",accession:accession1,
   revenueStatus:"MATCH",operatingStatus:"MISMATCH",
   vendorRevenueUsd:100e6,revenueUsdSec:100e6,
   vendorOperatingIncomeUsd:20e6,operatingIncomeUsdSec:5e6},
  {fiscalEnd:"2025-12-31",filedDate:"2026-02-10",accession:accession2,
   revenueStatus:"MISSING",operatingStatus:"MISSING",
   vendorRevenueUsd:120e6,revenueUsdSec:null,
   vendorOperatingIncomeUsd:30e6,operatingIncomeUsdSec:null},
 ],
};
const row=(accn,filed,end,start,val,extra={})=>({
 form:"10-K",accn,filed,end,start,val,...extra,
});
const raw={cik:1234,facts:{
 "us-gaap":{
  OperatingIncomeLoss:{label:"Income from Operations",units:{USD:[
   row(accession1,"2025-02-10","2024-12-31","2024-01-01",5e6),
  ]}},
  RevenueFromContractWithCustomerExcludingAssessedTax:{label:"Revenue",units:{USD:[
   row(accession1,"2025-02-10","2024-12-31","2024-01-01",100e6),
  ]}},
  NetIncomeLoss:{label:"Net income",units:{USD:[
   row(accession2,"2026-02-10","2025-12-31","2025-01-01",35e6),
  ]}},
  QuarterlyOperatingIncome:{label:"Operating income",units:{USD:[
   row(accession2,"2026-02-10","2025-12-31","2025-10-01",999e6),
  ]}},
  WrongAccessionOperatingIncome:{label:"Operating income",units:{USD:[
   row(accession1,"2025-02-10","2025-12-31","2025-01-01",999e6),
  ]}},
 },
 "demo":{
  NetPremiumsEarned:{label:"Premiums earned",units:{USD:[
   row(accession2,"2026-02-10","2025-12-31","2025-01-01",120e6),
  ]}},
  AlternateOperatingProfit:{label:"Operating profit",units:{USD:[
   row(accession1,"2025-02-10","2024-12-31","2024-01-01",20e6),
  ]}},
 },
}};
const result=diagnoseSecMarginDiscrepancies(check,raw);
assert.equal(result.verificationVerdict,"NEEDS_REVIEW");
assert.equal(result.altersPriorVerdict,false);
assert.equal(result.alternativesAreVerification,false);
assert.equal(result.executionEnabled,false);
assert.equal(result.transactionsWritten,false);
assert.equal(result.years[0].reviewReason,"CANONICAL_DIFFERENCE");
assert.equal(result.years[0].operatingDifferenceUsd,15e6);
assert.equal(result.years[0].operatingToleranceUsd,1e6);
assert.equal(result.years[1].reviewReason,"CANONICAL_FACT_MISSING");
assert.equal(result.years[1].operatingDifferenceUsd,null);
assert.equal(result.years[0].alternativeOriginalFilingFacts.some(x=>
 x.namespace==="demo"&&x.tag==="AlternateOperatingProfit"&&x.amountUsd===20e6),true);
assert.equal(result.years[1].alternativeOriginalFilingFacts.some(x=>
 x.tag==="NetPremiumsEarned"&&x.amountUsd===120e6),true);
assert.equal(result.years[1].alternativeOriginalFilingFacts.some(x=>
 x.tag==="QuarterlyOperatingIncome"),false);
assert.equal(result.years[1].alternativeOriginalFilingFacts.some(x=>
 x.tag==="WrongAccessionOperatingIncome"),false);
for (const y of result.years)for(const fact of y.alternativeOriginalFilingFacts){
 assert.equal(fact.accession,y.accession);
 assert.equal(fact.filed,y.filedDate);
 assert.equal(fact.end,y.fiscalEnd);
}
const clean=structuredClone(check);
clean.verdict="VERIFIED_MARGIN_CHANGE";
for (const y of clean.years) {
 y.revenueStatus="MATCH";y.operatingStatus="MATCH";
 y.revenueUsdSec=y.vendorRevenueUsd;
 y.operatingIncomeUsdSec=y.vendorOperatingIncomeUsd;
}
const cleanDiagnosis=diagnoseSecMarginDiscrepancies(clean,raw);
assert.equal(cleanDiagnosis.years.every(y=>y.alternativeOriginalFilingFacts.length===0),true);
assert.equal(cleanDiagnosis.verificationVerdict,"VERIFIED_MARGIN_CHANGE");
const noFiling=structuredClone(check);noFiling.years[0].accession=null;
assert.equal(diagnoseSecMarginDiscrepancies(noFiling,raw).years[0].reviewReason,
 "ORIGINAL_FILING_UNVERIFIED");
const route=fs.readFileSync("app/api/accelerated-growth/sec-two-year-margin/route.ts","utf8");
assert.match(route,/diagnoseSecMarginDiscrepancies\(check,sources\.facts\)/);
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/AG_SEC_MARGIN_ORIGIN_INVALID/);
assert.match(route,/persisted:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|getOpenAIClient|executeTransactions/);
console.log("AG SEC original-filing discrepancy evidence audit and fail-closed non-promotion passed.");
