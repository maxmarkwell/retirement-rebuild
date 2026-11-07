const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
const path="lib/discovery/accelerated-growth/accounting-identity-audit.ts";
const source=fs.readFileSync(path,"utf8");
const code=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const mod={};vm.runInNewContext(code,{exports:mod});
const {auditAgAccountingIdentity,AG_ACCOUNTING_IDENTITY_VERSION}=mod;
assert.equal(AG_ACCOUNTING_IDENTITY_VERSION,"ag-accounting-identity-v1");
const input={
 symbol:"DEMO",vendorIssuerName:"Demo Corporation",asOf:"2026-11-06",
 years:[
 {symbol:"DEMO",fiscalEnd:"2024-12-31",filedDate:"2025-02-10",
  revenueUsd:100e6,operatingIncomeUsd:82_676_000},
 {symbol:"DEMO",fiscalEnd:"2025-12-31",filedDate:"2026-02-10",
  revenueUsd:120e6,operatingIncomeUsd:259_264_000},
 ],
};
const accns=["0000001234-25-000001","0000001234-26-000002"];
const check={symbol:"DEMO",verdict:"NEEDS_REVIEW",independentIssuerVerified:true,
 years:input.years.map((x,i)=>({
  fiscalEnd:x.fiscalEnd,filedDate:x.filedDate,accession:accns[i],
  vendorOperatingIncomeUsd:x.operatingIncomeUsd,
  operatingIncomeUsdSec:i===0?93_610_000:267_151_000,
  operatingStatus:"MISMATCH",
 }))};
const submissions={filings:{recent:{
 form:["10-K","10-K","10-K/A"],
 accessionNumber:[accns[0],accns[1],"0000001234-26-000099"],
 filingDate:["2025-02-10","2026-02-10","2026-03-30"],
 reportDate:["2024-12-31","2025-12-31","2025-12-31"],
 primaryDocument:["year1.htm","year2.htm","amend.htm"],
}}};
const row=(i,val)=>({
 form:"10-K",accn:accns[i],filed:input.years[i].filedDate,
 start:i===0?"2024-01-01":"2025-01-01",
 end:input.years[i].fiscalEnd,val,
});
const facts={facts:{"us-gaap":{
 IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest:{
  units:{USD:[row(0,82_676_000),row(1,259_264_000)]},
 },
 InterestExpenseNonoperating:{units:{USD:[
  row(0,10_934_000),row(1,7_887_000),
 ]}},
}}};
const audit=auditAgAccountingIdentity(input,check,facts,submissions);
assert.equal(audit.verificationVerdict,"NEEDS_REVIEW");
assert.equal(audit.years[0].resolution,"VENDOR_ALIGNS_PRETAX_NOT_OPERATING");
assert.equal(audit.years[1].resolution,"VENDOR_ALIGNS_PRETAX_NOT_OPERATING");
assert.equal(audit.years[0].differenceMatchesReportedInterest,true);
assert.equal(audit.years[1].differenceMatchesReportedInterest,true);
assert.equal(audit.years[0].originalSecInterestExpenseUsd,10_934_000);
assert.equal(audit.years[1].originalSecInterestExpenseUsd,7_887_000);
const wrongInterest=structuredClone(facts);
wrongInterest.facts["us-gaap"].InterestExpenseNonoperating.units.USD[1].accn="0000001234-26-000099";
const wrongInterestAudit=auditAgAccountingIdentity(input,check,wrongInterest,submissions);
assert.equal(wrongInterestAudit.years[1].originalSecInterestExpenseUsd,null);
assert.equal(wrongInterestAudit.years[1].differenceMatchesReportedInterest,null);
assert.equal(audit.anyPretaxMislabelEvidence,true);
assert.equal(audit.years[1].amendmentReviewRequired,true);
assert.equal(audit.years[1].amendmentFilings[0].accession,"0000001234-26-000099");
assert.equal(audit.changesVerification,false);
assert.equal(audit.pricedEconomicsReady,false);
assert.equal(audit.executionEnabled,false);
assert.equal(audit.transactionsWritten,false);
// Wrong-accession numbers and comparative later-filing facts are not accepted.
const wrong=structuredClone(facts);
wrong.facts["us-gaap"].IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest.units.USD[1].accn=
 "0000001234-26-000099";
const unresolved=auditAgAccountingIdentity(input,check,wrong,submissions);
assert.equal(unresolved.years[1].originalSecPretaxIncomeUsd,null);
assert.equal(unresolved.years[1].vendorMatchesPretaxIncome,false);
assert.equal(unresolved.verificationVerdict,"NEEDS_REVIEW");
// A missing canonical tag is NOT rescued by a vendor number matching pretax.
const missing=structuredClone(check);
missing.years[1].operatingIncomeUsdSec=null;
missing.years[1].operatingStatus="MISSING";
const missingAudit=auditAgAccountingIdentity(input,missing,facts,submissions);
assert.equal(missingAudit.years[1].resolution,"MISSING_OR_CONFLICTING_SEC_CONCEPTS");
assert.equal(missingAudit.changesVerification,false);
const badAmend=structuredClone(submissions);
badAmend.filings.recent.filingDate[2]="2026-12-01";
assert.equal(auditAgAccountingIdentity(input,check,facts,badAmend).anyAmendmentReviewRequired,false);
const route=fs.readFileSync("app/api/accelerated-growth/sec-two-year-margin/route.ts","utf8");
assert.match(route,/auditAgAccountingIdentity\(input,check,sources\.facts,sources\.submissions\)/);
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/persisted:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions/);
console.log("AG accounting identity, amendment metadata, exact original accession and no-promotion tests passed.");
