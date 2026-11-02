import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assessSecurityIdentity } from "@/lib/discovery/accelerated-growth/security-identity";

export const dynamic = "force-dynamic";
type VendorRow = { symbol?: string; companyName?: string; exchangeShortName?: string; exchange?: string; currency?: string; isin?: string; price?: number; marketCap?: number; timestamp?: number };
async function fetchRows(endpoint: string, symbol: string): Promise<VendorRow[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_KEY_UNAVAILABLE");
  const url = new URL("https://financialmodelingprep.com/stable/" + endpoint);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", key);
  const response = await fetch(url, {cache:"no-store"});
  if (!response.ok) throw new Error("FMP_" + endpoint.toUpperCase() + "_UNAVAILABLE");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("FMP_INVALID_RESPONSE");
  return rows as VendorRow[];
}
export async function GET(request: Request) {
  const db = await createClient();
  const {data:{user}} = await db.auth.getUser();
  if (!user) return NextResponse.json({error:"AUTH_REQUIRED"},{status:401});
  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? "";
  if (symbol !== "MAIR" && symbol !== "MAIRE")
    return NextResponse.json({error:"DIAGNOSTIC_SYMBOL_UNSUPPORTED"},{status:400});
  try {
    const [profileRows,quoteRows] = await Promise.all([fetchRows("profile",symbol),fetchRows("quote",symbol)]);
    const profile = profileRows[0] ?? null, quote = quoteRows[0] ?? null;
    const identity = assessSecurityIdentity(symbol,profile,quote);
    const quoteTimestamp = typeof quote?.timestamp === "number" && Number.isFinite(quote.timestamp)
      ? new Date(quote.timestamp * 1000).toISOString() : null;
    const impliedShares = typeof quote?.marketCap === "number" && typeof quote?.price === "number" && quote.price > 0
      ? quote.marketCap / quote.price : null;
    return NextResponse.json({
      requestedSymbol:symbol, profile:profile ? {symbol:profile.symbol??null,companyName:profile.companyName??null,
        exchange:profile.exchangeShortName??profile.exchange??null,currency:profile.currency??null,isin:profile.isin??null}:null,
      quote:quote ? {symbol:quote.symbol??null,exchange:quote.exchangeShortName??quote.exchange??null,
        currency:quote.currency??null,isin:quote.isin??null,price:quote.price??null,marketCap:quote.marketCap??null,
        quoteTimestamp,impliedShares}:null, identity,
      reference:{issuer:"MAIRE S.p.A.",primaryTicker:"MAIRE",isin:"IT0004931058",currency:"EUR",
        historicalCloseDate:"2026-10-30",historicalClose:12.73,historicalShares:328640432},
      note:"FMP vendor responses are live and may be later than the saved 2026-11-02 research. The reference is historical; do not treat a later quote as a same-date match. Vendor cross-endpoint consistency is not independent identity verification.",
      executionEnabled:false
    },{headers:{"Cache-Control":"no-store"}});
  } catch {
    return NextResponse.json({error:"AG_IDENTITY_DIAGNOSTIC_UNAVAILABLE",executionEnabled:false},{status:502});
  }
}
