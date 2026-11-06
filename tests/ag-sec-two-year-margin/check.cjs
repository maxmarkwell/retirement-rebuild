const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
const file="lib/discovery/accelerated-growth/sec-two-year-margin.ts";
const src=fs.readFileSync(file,"utf8").replace(/^import "server-only";\s*/m,"");
const js=ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const mod={};vm.runInNewContext(js,{exports:mod});
const {reconcileTwoYearSecMargins,AG_SEC_MARGIN_VERSION}=mod;
assert.equal(AG_SEC_MARGIN_VERSION,"ag-sec-margin-two-year-v1");
const input={
 symbol:"DEMO",vendorIssuerName:"Demo Corporation",asOf:"2026-11-06",
 years:[
  {symbol:"DEMO",fiscalEnd:"2024-12-31",filedDate:"2025-02-10",
   revenueUsd:100000000,operatingIncomeUsd:5000000},
  {symbol:"DEMO",fiscalEnd:"2025-12-31",filedDate:"2026-02-10",
   revenueUsd:120000000,operatingIncomeUsd:18000000},
 ],
};
const accns=["0000001234-25-000001","0000001234-26-000002"];
const map=[{cik_str:1234,ticker:"DEMO",title:"Demo Corporation"}];
const submissions={
 cik:1234,name:"Demo Corporation",tickers:["DEMO"],
 filings:{recent:{
  form:["10-K","10-K"],accessionNumber:accns,
  filingDate:["2025-02-10","2026-02-10"],
  reportDate:["2024-12-31","2025-12-31"],
  primaryDocument:["year1.htm","year2.htm"],
 }},
};
const row=(i,val)=>({
 form:"10-K",accn:accns[i],filed:input.years[i].filedDate,
 start:i===0?"2024-01-01":"2025-01-01",
 end:input.years[i].fiscalEnd,val,
});
const sec={
 cik:1234,facts:{"us-gaap":{
  RevenueFromContractWithCustomerExcludingAssessedTax:{
   units:{USD:[row(0,100000000),row(1,120000000)]},
  },
  OperatingIncomeLoss:{units:{USD:[row(0,5000000),row(1,18000000)]}},
 }},
};
const good=reconcileTwoYearSecMargins(input,map,submissions,sec);
assert.equal(good.verdict,"VERIFIED_MARGIN_CHANGE");
assert.equal(good.reportedVendorSignalConfirmed,true);
assert.ok(Math.abs(good.secMarginChangePp-10)<1e-9);
assert.ok(Math.abs(good.vendorMarginChangePp-10)<1e-9);
assert.equal(good.years[0].revenueStatus,"MATCH");
assert.equal(good.years[1].operatingStatus,"MATCH");
assert.equal(good.years[0].accession,accns[0]);
assert.equal(good.years[1].accession,accns[1]);
assert.equal(good.independentIssuerVerified,true);
assert.equal(good.executionEnabled,false);
assert.equal(good.transactionsWritten,false);
assert.equal(good.economicRankingPerformed,false);
assert.equal(good.recommendation,null);
const copied=structuredClone(sec);
copied.facts["us-gaap"].OperatingIncomeLoss.units.USD[0].accn=accns[1];
const missing=reconcileTwoYearSecMargins(input,map,submissions,copied);
assert.equal(missing.verdict,"NEEDS_REVIEW");
assert.equal(missing.years[0].operatingStatus,"MISSING");
assert.equal(missing.secMarginChangePp,null);
// A numerical mismatch is NOT silently absorbed as a valid margin signal.
const mismatch=structuredClone(sec);
mismatch.facts["us-gaap"].OperatingIncomeLoss.units.USD[1].val=12000000;
const disputed=reconcileTwoYearSecMargins(input,map,submissions,mismatch);
assert.equal(disputed.years[1].operatingStatus,"MISMATCH");
assert.equal(disputed.reportedVendorSignalConfirmed,false);
const ambiguous=structuredClone(sec);
ambiguous.facts["us-gaap"].Revenues={units:{USD:[row(1,140000000)]}};
const amb=reconcileTwoYearSecMargins(input,map,submissions,ambiguous);
assert.equal(amb.years[1].revenueStatus,"AMBIGUOUS");
assert.equal(amb.secMarginChangePp,null);
const wrongIssuer={...submissions,name:"Other Corporation"};
const different=reconcileTwoYearSecMargins(input,map,wrongIssuer,sec);
assert.equal(different.independentIssuerVerified,false);
assert.equal(different.verdict,"NEEDS_REVIEW");
assert.ok(different.errors.includes("SEC_ISSUER_IDENTITY_UNVERIFIED"));
const missing10k=structuredClone(submissions);
missing10k.filings.recent.reportDate[1]="2025-09-30";
const no10k=reconcileTwoYearSecMargins(input,map,missing10k,sec);
assert.ok(no10k.errors.includes("SEC_ORIGINAL_10K_UNVERIFIED_1"));
assert.equal(no10k.verdict,"NEEDS_REVIEW");
const futuristic=structuredClone(input);
futuristic.years[1].filedDate="2027-01-01";
assert.throws(()=>reconcileTwoYearSecMargins(futuristic,map,submissions,sec));
const mixed=structuredClone(input);mixed.years[1].symbol="OTHER";
assert.throws(()=>reconcileTwoYearSecMargins(mixed,map,submissions,sec));
const route=fs.readFileSync("app/api/accelerated-growth/sec-two-year-margin/route.ts","utf8");
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/AG_SEC_MARGIN_ORIGIN_INVALID/);
assert.match(route,/body\.symbols\.length>3/);
assert.match(route,/cache:"no-store"/);
assert.match(route,/persisted:false/);
assert.match(route,/executionEnabled:false,transactionsWritten:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions|getOpenAIClient/);
console.log("AG exact 10-K two-year SEC margin reconciliation and read-only tests passed.");
