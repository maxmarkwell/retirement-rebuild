const assert=require("node:assert/strict"),fs=require("node:fs"),
 vm=require("node:vm"),ts=require("typescript");
const src=fs.readFileSync("lib/discovery/accelerated-growth/price-implied-fcf-hurdle.ts","utf8");
const js=ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const mod={};vm.runInNewContext(js,{exports:mod});
const {assessAgPriceImpliedFcfHurdle}=mod;
const sec="https://www.sec.gov/Archives/edgar/data/1651562/000165156226000072/cour-20260930.htm";
const i={
 symbol:"COUR",asOf:"2026-11-06",quoteUsd:3.74,
 quoteDate:"2026-11-06",quoteEvidenceRef:"https://example.com/quote",
 shareCount:253300000,sharesAsOf:"2026-10-29",
 sharesEvidenceRef:sec,sharesBasis:"dated outstanding common shares",
 balanceDate:"2026-09-30",balanceEvidenceRef:sec,
 cashAndEquivalentsUsd:670600000,marketableSecuritiesUsd:104900000,
 totalLiabilitiesUsd:748100000,deferredRevenueUsd:461700000,
 historicalCashFromOperationsUsd:10300000,
 historicalSoftwareAndContentAndEquipmentPurchasesUsd:35300000,
 historicalStockCompensationUsd:83000000,
 cashFlowPeriod:"Nine months ended Sep 30, 2026",
 normalizedFcfVerified:false,netDebtReconciled:false,
};
const r=assessAgPriceImpliedFcfHurdle(i);
assert.ok(Math.abs(r.marketCapitalizationUsd-947342000)<.001);
assert.equal(r.liquidAssetsReportedUsd,775500000);
assert.equal(r.reportedCashMinusTotalLiabilitiesUsd,27400000);
assert.equal(r.historicalNineMonthLeveredCashProxyUsd,-25000000);
assert.equal(r.rows.length,8);
assert.equal(r.rows[0].requiredAnnualSustainableFcfUsd,94734200);
assert.equal(r.rows[1].requiredAnnualSustainableFcfUsd,947342000/15);
const cash50=r.rows.find(x=>x.availableCashFractionHypothesis===.5&&x.fcfMultipleHypothesis===10);
assert.ok(Math.abs(cash50.requiredAnnualSustainableFcfUsd-55959200)<.001);
assert.equal(r.normalizedFcfVerified,false);
assert.equal(r.adjustedNetDebtVerified,false);
assert.equal(r.decision,"NOT_ASSESSED");
assert.equal(r.executionEnabled,false);
assert.equal(r.transactionsWritten,false);
assert.throws(()=>assessAgPriceImpliedFcfHurdle({...i,normalizedFcfVerified:true}));
assert.throws(()=>assessAgPriceImpliedFcfHurdle({...i,netDebtReconciled:true}));
assert.throws(()=>assessAgPriceImpliedFcfHurdle({...i,quoteDate:"2026-11-07"}));
assert.throws(()=>assessAgPriceImpliedFcfHurdle({...i,deferredRevenueUsd:800000000}));
const cheaper=assessAgPriceImpliedFcfHurdle({...i,quoteUsd:2.74});
assert.ok(cheaper.rows[0].requiredAnnualSustainableFcfUsd<r.rows[0].requiredAnnualSustainableFcfUsd);
const moreDiluted=assessAgPriceImpliedFcfHurdle({...i,shareCount:303300000});
assert.ok(moreDiluted.rows[0].requiredAnnualSustainableFcfUsd>r.rows[0].requiredAnnualSustainableFcfUsd);
const route=fs.readFileSync("app/api/accelerated-growth/cour-economics-readiness/route.ts","utf8");
assert.match(route,/db\.auth\.getUser\(\)/);
assert.match(route,/MANUALLY_CURATED_DATED_PUBLIC_EVIDENCE/);
assert.match(route,/priceSensitiveScenarioValuationPerformed:false/);
assert.match(route,/persisted:false/);
assert.match(route,/executionEnabled:false,transactionsWritten:false/);
assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions|getOpenAIClient/);
console.log("COUR price sensitivity, dilution sensitivity, cash hurdle and fail-closed research safety passed.");
