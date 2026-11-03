import "server-only";
import { assessSecurityIdentity } from "./security-identity";
import type { DynamicUniverseStock, MarketCapBucket } from "../dynamic-universe";
import { passesAgTradabilityGate } from "./discovery";

type Profile = { symbol?:string; companyName?:string; exchangeShortName?:string; exchange?:string; currency?:string; isin?:string; country?:string; sector?:string; industry?:string; isEtf?:boolean; isFund?:boolean; isActivelyTrading?:boolean; marketCap?:number };
type Quote = { symbol?:string; exchangeShortName?:string; exchange?:string; currency?:string; isin?:string; price?:number; marketCap?:number; volume?:number };
const bucket = (cap:number):MarketCapBucket => cap < 2e9 ? "small" : cap < 10e9 ? "mid" : cap < 200e9 ? "large" : "mega";

/** Explicit targeted research only: USD-traded operating equity on a primary US exchange.
 * Does NOT widen the automated Discovery universe or certify issuer identity independently.
 */
export async function getTargetedAgCandidate(symbol:string):Promise<DynamicUniverseStock> {
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_TARGET_INVALID_SYMBOL");
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("AG_TARGET_FMP_UNAVAILABLE");
  const read = async (endpoint:string):Promise<unknown> => {
    const url = new URL("https://financialmodelingprep.com/stable/"+endpoint);
    url.searchParams.set("symbol",symbol);
    url.searchParams.set("apikey",key);
    const res=await fetch(url,{cache:"no-store"});
    if (!res.ok) throw new Error("AG_TARGET_FMP_UNAVAILABLE");
    return res.json();
  };
  const [profiles,quotes]=await Promise.all([read("profile"),read("quote")]);
  if (!Array.isArray(profiles) || profiles.length !== 1 || !Array.isArray(quotes) || quotes.length !== 1)
    throw new Error("AG_TARGET_SECURITY_UNVERIFIED");
  const p=profiles[0] as Profile, q=quotes[0] as Quote;
  const identity=assessSecurityIdentity(symbol,p,q);
  if (identity.status === "MISMATCH" || !p.companyName || p.symbol?.toUpperCase() !== symbol ||
      q.symbol?.toUpperCase() !== symbol || identity.profileExchange !== "NASDAQ" &&
      identity.profileExchange !== "NYSE" && identity.profileExchange !== "AMEX" ||
      identity.quoteExchange !== identity.profileExchange ||
      identity.profileCurrency !== "USD" ||
      (identity.quoteCurrency != null && identity.quoteCurrency !== "USD"))
    throw new Error("AG_TARGET_SECURITY_UNVERIFIED");
  if (p.isEtf === true || p.isFund === true || p.isActivelyTrading === false ||
      p.sector === "Financial Services" || p.sector === "Real Estate" ||
      /\b(warrants?|rights|preferred|notes|debentures?|bonds|units)\b/i.test(p.companyName))
    throw new Error("AG_TARGET_INELIGIBLE_SECURITY");
  const price=Number(q.price), marketCap=Number(q.marketCap), volume=Number(q.volume);
  if (!Number.isFinite(price) || !Number.isFinite(marketCap) || !Number.isFinite(volume))
    throw new Error("AG_TARGET_MARKET_DATA_UNAVAILABLE");
  const stock:DynamicUniverseStock={
    ticker:symbol,companyName:p.companyName,marketCap,price,volume,dollarVolume:volume*price,
    exchange:q.exchange ?? p.exchange ?? null,exchangeShortName:identity.quoteExchange,
    sector:p.sector ?? null,industry:p.industry ?? null,marketCapBucket:bucket(marketCap)
  };
  if (!passesAgTradabilityGate(stock)) throw new Error("AG_TARGET_NOT_TRADABLE");
  return stock;
}
