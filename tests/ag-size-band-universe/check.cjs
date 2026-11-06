const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, deps=()=>{throw Error("unexpected import")}) {
 const source=fs.readFileSync(path,"utf8");
 const js=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 }}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:deps});
 return exports;
}
const intake=load("lib/discovery/accelerated-growth/universe-intake.ts");
const banded=load("lib/discovery/accelerated-growth/size-band-universe.ts",
 n=>{assert.equal(n,"./universe-intake");return intake;});
const {collectAgSizeBandUniverse,SIZE_BANDS}=banded;
const route=fs.readFileSync("app/api/accelerated-growth/size-band-universe/route.ts","utf8");
const row=(symbol,marketCap)=>({
 symbol,companyName:"Company "+symbol,
 country:"US",exchangeShortName:"NASDAQ",isEtf:false,isFund:false,
 isActivelyTrading:true,marketCap,price:10,volume:400000,sector:"Industrials",
});
const options={
 pagesPerBand:1,pageSize:2,
 startedAt:"2026-11-06T16:00:00Z",
 finishedAt:()=> "2026-11-06T16:00:02Z",
};
const values=[150e6,2e9,20e9,200e9];
(async()=>{
 const calls=[];
 const result=await collectAgSizeBandUniverse(async (band,page,limit)=>{
  calls.push({band:band.id,page,limit});
  const i=SIZE_BANDS.findIndex(x=>x.id===band.id);
  return [row("SYM"+i,values[i])];
 },options);
 assert.equal(result.version,"ag-size-band-universe-v1");
 assert.equal(calls.length,4);
 assert.equal(calls.every(x=>x.page===0&&x.limit===2),true);
 assert.equal(result.totalEligible,4);
 assert.equal(result.totalProviderRowsSeen,4);
 assert.equal(result.totalRejected,0);
 assert.equal(result.bandSummaries.length,4);
 assert.equal(result.bandSummaries.every(x=>x.coverage==="PROVIDER_PAGE_EXHAUSTED"),true);
 assert.equal(result.sizeBandCoverage,"ALL_FILTERED_BANDS_EXHAUSTED");
 assert.equal(result.candidates[0].sizeBand,"small");
 assert.equal(result.candidates[3].sizeBand,"large");
 assert.equal(result.entireMarketVerified,false);
 assert.equal(result.quoteVerification,false);
 assert.equal(result.investmentDecisionsIssued,0);
 assert.equal(result.economicRankingPerformed,false);
 assert.equal(result.tradesEnabled,false);
 const capped=await collectAgSizeBandUniverse(async(band,page,limit)=>{
  const i=SIZE_BANDS.findIndex(x=>x.id===band.id);
  return [row("ONE"+i,values[i]),row("TWO"+i,values[i]*1.1)];
 },options);
 assert.equal(capped.sizeBandCoverage,"PARTIAL_CAPPED");
 assert.equal(capped.bandSummaries.every(x=>x.coverage==="CAPPED_UNVERIFIED"),true);
 await assert.rejects(()=>collectAgSizeBandUniverse(async band=>
  [row("BAD",band.minExclusiveUsd)],options),/BOUNDARY_MISMATCH/);
 await assert.rejects(()=>collectAgSizeBandUniverse(async band=>
  [row("BAD",band.maxExclusiveUsd??40e9)],options),/BOUNDARY_MISMATCH/);
 await assert.rejects(()=>collectAgSizeBandUniverse(async band=>
  [row("SAME",band.minExclusiveUsd+1000000)],options),/DUPLICATE_SYMBOL/);
 await assert.rejects(()=>collectAgSizeBandUniverse(async band=>[
  row("A",band.minExclusiveUsd+1000000),
  row("B",band.minExclusiveUsd+2000000),
  row("C",band.minExclusiveUsd+3000000),
 ],options),/INVALID_PROVIDER_PAGE/);
 await assert.rejects(()=>collectAgSizeBandUniverse(async()=>[],{
  ...options,pagesPerBand:3,
 }),/INVALID_SCOPE/);
 assert.match(route,/db\.auth\.getUser\(\)/);
 assert.match(route,/marketCapLowerThan/);
 assert.match(route,/marketCapMoreThan/);
 assert.match(route,/cache: "no-store"/);
 assert.match(route,/executionEnabled: false, transactionsWritten: false/);
 assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|executeTransactions|openai|processTrade/);
 console.log("Four-band breadth, caps, bounds, duplication, source filters and read-only safety passed.");
})().catch(err=>{console.error(err);process.exitCode=1});
