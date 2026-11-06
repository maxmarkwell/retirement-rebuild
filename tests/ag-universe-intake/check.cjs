const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = fs.readFileSync("lib/discovery/accelerated-growth/universe-intake.ts","utf8");
const route = fs.readFileSync("app/api/accelerated-growth/universe-intake/route.ts","utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const moduleExports={};
vm.runInNewContext(compiled,{exports:moduleExports});
const {collectAgUniverse,AG_UNIVERSE_INTAKE_VERSION,AG_UNIVERSE_FILTERS}=moduleExports;
const row=(symbol,extra={})=>({
 symbol,companyName:"Issuer for "+symbol,country:"US",exchangeShortName:"NASDAQ",
 sector:"Technology",industry:"Systems",marketCap:80000000,price:12,
 volume:350000,isEtf:false,isFund:false,isActivelyTrading:true,...extra,
});
const startedAt="2026-11-06T14:00:00.000Z",finishedAt=()=> "2026-11-06T14:00:01.000Z";
(async()=>{
 const requests=[];
 const pages=[
  [row("ZETA"),row("ALPHA",{sector:"Health Care"}),row("OMEGA",{exchangeShortName:"NYSE"})],
  [row("BETA"),row("ETF1",{isEtf:true})],
 ];
 const result=await collectAgUniverse(async(page,limit)=>{
  requests.push({page,limit});return pages[page]??[];
 },{maxPages:4,pageSize:3,startedAt,finishedAt});
 assert.equal(result.version,AG_UNIVERSE_INTAKE_VERSION);
 assert.deepEqual(requests.map(x=>x.page),[0,1]);
 assert.equal(result.pagesRequested,2);
 assert.equal(result.coverage,"PROVIDER_PAGE_EXHAUSTED");
 assert.equal(result.providerRowsSeen,5);
 assert.equal(result.eligibleRows,4);
 assert.equal(result.rejectedRows,1);
 assert.equal(result.candidates[0].symbol,"ZETA");
 assert.equal(result.candidates[1].symbol,"ALPHA");
 assert.equal(result.candidates[2].symbol,"OMEGA");
 assert.equal(result.candidates[3].symbol,"BETA");
 assert.equal(result.candidates[2].providerPage,0);
 assert.equal(result.candidates[3].providerPage,1);
 assert.equal(result.candidates[0].quoteVerified,false);
 assert.equal(result.candidates[0].issuerVerified,false);
 assert.equal(result.candidates[0].researchRank,null);
 assert.equal(result.allUSMarketsCovered,false);
 assert.equal(result.economicRankingPerformed,false);
 assert.equal(result.researchDecisionsIssued,0);
 assert.equal(result.tradesEnabled,false);
 assert.equal(result.sectorsSeen["Technology"],3);
 assert.equal(result.sectorsSeen["Health Care"],1);
 assert.equal(result.exchangesSeen.NYSE,1);
 assert.equal(result.rejectionReasons.INSTRUMENT_TYPE_UNVERIFIED,1);
 assert.equal(AG_UNIVERSE_FILTERS.country,"US");
 assert.equal(AG_UNIVERSE_FILTERS.isEtf,"false");
 const cap=await collectAgUniverse(async()=>[row("XYZ"),row("ABC")],
   {maxPages:1,pageSize:2,startedAt,finishedAt});
 assert.equal(cap.coverage,"CAPPED_UNVERIFIED");
 assert.equal(cap.candidates.length,2);
 const rejected=await collectAgUniverse(async()=>[
  row("X",{country:"CA"}),row("Y",{marketCap:1000}),row("Z",{isFund:true}),
 ],{maxPages:1,pageSize:3,startedAt,finishedAt});
 assert.equal(rejected.eligibleRows,0);
 assert.equal(rejected.rejectedRows,3);
 assert.equal(rejected.coverage,"CAPPED_UNVERIFIED");
 await assert.rejects(()=>collectAgUniverse(async(page)=>
   page===0?[row("ONE"),row("TWO")]:[row("ONE")],
   {maxPages:2,pageSize:2,startedAt,finishedAt}),/DUPLICATE_SYMBOL/);
 await assert.rejects(()=>collectAgUniverse(async()=>({error:"rate limit"}),
   {maxPages:1,pageSize:3,startedAt,finishedAt}),/INVALID_PROVIDER_PAGE/);
 await assert.rejects(()=>collectAgUniverse(async()=>[row("A"),row("B"),row("C"),row("D")],
   {maxPages:1,pageSize:3,startedAt,finishedAt}),/INVALID_PROVIDER_PAGE/);
 await assert.rejects(()=>collectAgUniverse(async()=>[row("A")],
   {maxPages:6,pageSize:3,startedAt,finishedAt}),/INVALID_SCOPE/);
 assert.match(route,/db\.auth\.getUser\(\)/);
 assert.match(route,/cache: "no-store"/);
 assert.match(route,/isActivelyTrading/);
 assert.match(route,/executionEnabled:false,transactionsWritten:false/);
 assert.doesNotMatch(route,/\.from\(|\.insert\(|\.update\(|\.delete\(|getOpenAIClient|executeTransactions/);
 assert.doesNotMatch(source,/sort\(|sample\(|getOpenAIClient|executeTransactions/);
 console.log("AG broad screener paging, coverage honesty, exclusions, duplicate protection and read-only checks passed.");
})().catch(e=>{console.error(e);process.exitCode=1});
