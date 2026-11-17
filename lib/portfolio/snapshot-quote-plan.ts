/**
 * Pure scheduler for daily quote refreshes. Two Vercel cron invocations,
 * one hour apart, can cover 14 held symbols at 7 credits each; limit 7
 * preserves one credit/minute of headroom under Twelve Data's 8-credit limit.
 * Oldest fetched symbols first prevents alphabetical starvation.
 */
export const SNAPSHOT_PROVIDER_FETCH_LIMIT = 7;
export const SNAPSHOT_REFRESH_CREDITS_PER_RUN = 7;
type CachedQuote = {
 ticker:string;
 price:number|null;
 fetched_at:string|null;
};
const DENVER_TIME_ZONE = "America/Denver";
function denverDate(ts:string):string|null {
 const parsed=new Date(ts);
 if(!Number.isFinite(parsed.getTime()))return null;
 return new Intl.DateTimeFormat("en-CA",{
  timeZone:DENVER_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",
 }).format(parsed);
}
export function planSnapshotQuoteRefresh(
 heldTickers:readonly string[],cachedQuotes:readonly CachedQuote[],
 snapshotDate:string,
){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate))
  throw Error("SNAPSHOT_INVALID_DATE");
 const cacheByTicker=new Map(
  cachedQuotes.map(row=>[row.ticker.trim().toUpperCase(),row]),
 );
 const freshTickers:string[]=[];
 const staleTickers:{ticker:string;lastFetchedAt:string|null}[]=[];
 const seen=new Set<string>();
 for(const input of heldTickers){
  const ticker=input.trim().toUpperCase();
  if(!ticker||seen.has(ticker))continue;
  seen.add(ticker);
  const row=cacheByTicker.get(ticker);
  if(row&&typeof row.price==="number"&&Number.isFinite(row.price)&&row.price>0&&
     typeof row.fetched_at==="string"&&denverDate(row.fetched_at)===snapshotDate){
   freshTickers.push(ticker);
  }else{
   staleTickers.push({ticker,lastFetchedAt:row?.fetched_at??null});
  }
 }
 // Invalid or absent fetch times go first; chronological retry after that.
 // No ticker can remain unrefreshed solely because its name sorts late.
 staleTickers.sort((a,b)=>{
  const x=a.lastFetchedAt?Date.parse(a.lastFetchedAt):NaN;
  const y=b.lastFetchedAt?Date.parse(b.lastFetchedAt):NaN;
  const ax=Number.isFinite(x)?x:-Infinity;
  const by=Number.isFinite(y)?y:-Infinity;
  return ax-by||a.ticker.localeCompare(b.ticker);
 });
 const needingRefresh=staleTickers.map(x=>x.ticker);
 return {
  freshTickers:freshTickers.sort(),
  needingRefresh,
  scheduledTickers:needingRefresh.slice(0,SNAPSHOT_REFRESH_CREDITS_PER_RUN),
  deferredTickers:needingRefresh.slice(SNAPSHOT_REFRESH_CREDITS_PER_RUN),
 };
}
