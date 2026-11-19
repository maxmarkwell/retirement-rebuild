const assert=require("node:assert/strict");
const fs=require("node:fs"),ts=require("typescript"),vm=require("node:vm");
const src=fs.readFileSync("lib/portfolio/snapshot-quote-plan.ts","utf8");
const code=ts.transpileModule(src,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const moduleExports={};vm.runInNewContext(code,{exports:moduleExports,Intl,Date,Map,Set});
const {planSnapshotQuoteRefresh:plan,SNAPSHOT_REFRESH_CREDITS_PER_RUN:budget,
 SNAPSHOT_PROVIDER_FETCH_LIMIT:batch}=moduleExports;
assert.equal(batch,7);
assert.equal(budget,7);
assert.ok(budget<=7,"leave one credit of 8/minute cap");
const tickers=["ABNB","ADBE","APP","AWI","AYI","BKNG","INTU",
 "PCTY","PODD","QLYS","SENEA","SFM","TTD","UBER"];
const day="2026-11-17";
const yesterday="2026-11-16T23:12:42.000Z";
const old="2026-10-26T23:12:42.000Z";
const today="2026-11-17T22:15:00.000Z";
const quotes=tickers.map(ticker=>({
 ticker,price:100,fetched_at: ticker==="TTD"||ticker==="UBER"?old:yesterday,
}));
let first=plan(tickers,quotes,day);
assert.deepEqual([...first.scheduledTickers].slice(0,2),["TTD","UBER"]);
assert.equal(first.scheduledTickers.length,7);
assert.equal(first.deferredTickers.length,7);
assert.equal(first.freshTickers.length,0);
// The real schedule invokes prewarm then daily one hour apart.
const warmed=quotes.map(q=>first.scheduledTickers.includes(q.ticker)?
 {...q,fetched_at:today}:q);
let second=plan(tickers,warmed,day);
assert.equal(second.freshTickers.length,7);
assert.equal(second.scheduledTickers.length,7);
assert.equal(second.deferredTickers.length,0);
const completed=warmed.map(q=>second.scheduledTickers.includes(q.ticker)?
 {...q,fetched_at:today}:q);
let done=plan(tickers,completed,day);
assert.equal(done.needingRefresh.length,0);
assert.equal(done.freshTickers.length,14);
// New symbol without cache cannot indefinitely starve late-alphabet symbols.
const extended=plan([...tickers,"ZZZZ"],quotes,day);
assert.equal(extended.scheduledTickers[0],"ZZZZ");
assert.ok(extended.scheduledTickers.includes("UBER"));
// Invalid, zero or no-price cache must NEVER be marked as fresh.
const negative=plan(["ABNB"],[{ticker:"ABNB",price:-1,fetched_at:today}],day);
assert.deepEqual([...negative.freshTickers],[]);
assert.deepEqual([...negative.scheduledTickers],["ABNB"]);
const invalidTs=plan(["ABNB"],[{ticker:"ABNB",price:100,fetched_at:"not-a-date"}],day);
assert.equal(invalidTs.freshTickers.length,0);
assert.throws(()=>plan(["ABNB"],[], "bad-date"));
// Boundary: today in UTC may be previous trading date in Denver.
const afterMidnightUtc=plan(["ABNB"],[
 {ticker:"ABNB",price:1,fetched_at:"2026-11-18T00:10:00.000Z"}
],day);
assert.equal(afterMidnightUtc.freshTickers.length,1);
// Daily cron must report incomplete portfolio snapshots as non-200.
const daily=fs.readFileSync("app/api/snapshots/daily/route.ts","utf8");
assert.match(daily,/status: complete \? 200 : 503/);
assert.match(daily,/missingTickers: result\.missingTickers/);
assert.match(daily,/skippedPortfolioNames: result\.skippedPortfolioNames/);
const snapshot=fs.readFileSync("lib/portfolio/snapshots.ts","utf8");
assert.match(snapshot,/planSnapshotQuoteRefresh\(/);
assert.match(snapshot,/const eligiblePortfolios = portfolios\.filter/);
assert.match(snapshot,/marketPrices\[ticker\] == null/);
assert.match(snapshot,/if \(eligiblePortfolios\.length === 0\)/);
assert.match(snapshot,/\.upsert\(rows,/);
assert.doesNotMatch(snapshot,/marketPrices\[ticker\]\s*\?\?\s*(purchase|cost|basis)/);
const vercel=JSON.parse(fs.readFileSync("vercel.json","utf8"));
assert.equal(vercel.crons.length,3);
assert.deepEqual(vercel.crons.map(c=>c.path),
 ["/api/snapshots/prewarm","/api/snapshots/retry","/api/snapshots/daily"]);
assert.deepEqual(vercel.crons.map(c=>c.schedule),["0 22 * * 1-5","0 23 * * 1-5","0 0 * * 2-6"]);
const retry=fs.readFileSync("app/api/snapshots/retry/route.ts","utf8");
assert.match(retry,/export \{ GET \} from "\.\.\/prewarm\/route"/);
// A missing response from the second window can be retried in a third run.
const partiallyReturned=completed.map(q=>q.ticker==="SENEA"?
 {...q,fetched_at:yesterday}:q);
const third=plan(tickers,partiallyReturned,day);
assert.deepEqual([...third.scheduledTickers],["SENEA"]);
assert.equal(third.deferredTickers.length,0);
assert.equal(plan(tickers,partiallyReturned.map(q=>q.ticker==="SENEA"?
 {...q,fetched_at:today}:q),day).needingRefresh.length,0);
console.log("14-ticker two-cron coverage, oldest-first, freshness, partial-response status and safety passed.");
