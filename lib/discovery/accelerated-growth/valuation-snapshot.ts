import { getCompanyFundamentals } from "@/lib/company-data/fmp";

export type AgValuationSnapshot = {
  version: "ag-valuation-v2";
  ttmRevenue: number | null;
  ttmNetIncome: number | null;
  ttmQuarterEnds: string[];
  symbol: string;
  fetchedAt: string;
  source: "FMP";
  marketCap: number | null;
  enterpriseValue: number | null;
  annualRevenue: number | null;
  annualNetIncome: number | null;
  annualFreeCashFlow: number | null;
  priceToSales: number | null;
  priceToEarnings: number | null;
  priceToFreeCashFlow: number | null;
  evToSales: number | null;
  dataQuality: "PARTIAL" | "UNAVAILABLE";
  limitations: string[];
};

const valid = (n: number | null) => n != null && Number.isFinite(n) ? n : null;
const multiple = (n: number | null, d: number | null) =>
  n != null && d != null && n > 0 && d > 0 ? n / d : null;

type Quarter = { date?: string; revenue?: number; netIncome?: number };
export function computeTtm(rows: Quarter[]) {
  const ordered = [...rows].sort((a,b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0,4);
  const dates = ordered.map(r => r.date ?? "");
  if (ordered.length !== 4 || new Set(dates).size !== 4) return { revenue: null, netIncome: null, dates, error: "Missing or duplicate quarters" };
  const timestamps = dates.map(d => Date.parse(d + "T00:00:00Z"));
  if (timestamps.some(t => !Number.isFinite(t))) return { revenue: null, netIncome: null, dates, error: "Invalid quarter date" };
  for(let i=1;i<4;i++) {
    const gap = (timestamps[i-1]-timestamps[i])/86400000;
    if(gap<75 || gap>110) return { revenue: null, netIncome: null, dates, error: "Nonconsecutive fiscal quarters" };
  }
  const revenue = ordered.every(r => typeof r.revenue === "number" && Number.isFinite(r.revenue))
    ? ordered.reduce((sum,r) => sum + (r.revenue as number),0) : null;
  const netIncome = ordered.every(r => typeof r.netIncome === "number" && Number.isFinite(r.netIncome))
    ? ordered.reduce((sum,r) => sum + (r.netIncome as number),0) : null;
  return { revenue, netIncome, dates, error: revenue == null ? "Incomplete quarterly revenue" : null };
}
async function getQuarterly(symbol: string): Promise<Quarter[]> {
  const key=process.env.FMP_API_KEY;
  if(!key) throw new Error("FMP_API_KEY missing");
  const url=new URL("https://financialmodelingprep.com/stable/income-statement");
  for(const [k,v] of Object.entries({symbol,period:"quarter",limit:"8",apikey:key})) url.searchParams.set(k,v);
  const response=await fetch(url,{next:{revalidate:3600}});
  if(!response.ok) throw new Error("FMP quarterly request failed: "+response.status);
  const json: unknown=await response.json();
  if(!Array.isArray(json)) throw new Error("Invalid quarterly response");
  return json as Quarter[];
}

export async function getAgValuationSnapshot(symbol: string): Promise<AgValuationSnapshot> {
  const f = await getCompanyFundamentals(symbol);
  const quarterResult = await getQuarterly(symbol).then(rows => ({rows,error:null as string | null})).catch(e => ({rows:[] as Quarter[],error:String(e)}));
  const ttm=computeTtm(quarterResult.rows);
  const marketCap = valid(f.marketCap);
  const enterpriseValue = valid(f.enterpriseValue);
  const annualRevenue = valid(f.revenue);
  const annualNetIncome = valid(f.netIncome);
  const annualFreeCashFlow = valid(f.freeCashFlow);
  const limitations = [
    "FMP market values may be cached for up to one hour; fetchedAt is not the market quote timestamp.",
    "Annual financial values are context only, NOT trailing twelve months; fiscal period end is unavailable.",
    "TTM values are calculated from four dated FMP quarters but not reconciled to SEC filings.",
    "TTM free cash flow is unavailable; annual free cash flow is not a TTM substitute.",
    "Share price, balance-sheet cash/debt timestamps, and independently verified SEC provenance are not included.",
  ];
  if (quarterResult.error) limitations.push("Quarterly fetch: "+quarterResult.error);
  if (ttm.error) limitations.push("TTM validation: "+ttm.error);
  if (marketCap == null) limitations.push("Market capitalization unavailable.");
  if (enterpriseValue == null) limitations.push("Enterprise value unavailable.");
  if (annualRevenue == null) limitations.push("Annual revenue unavailable.");
  return {
    version: "ag-valuation-v2", ttmRevenue: ttm.revenue, ttmNetIncome: ttm.netIncome, ttmQuarterEnds: ttm.dates,
    symbol, fetchedAt: new Date().toISOString(), source: "FMP",
    marketCap, enterpriseValue, annualRevenue, annualNetIncome, annualFreeCashFlow,
    priceToSales: multiple(marketCap, ttm.revenue),
    priceToEarnings: multiple(marketCap, ttm.netIncome),
    priceToFreeCashFlow: null,
    evToSales: multiple(enterpriseValue, ttm.revenue),
    dataQuality: marketCap != null && ttm.revenue != null ? "PARTIAL" : "UNAVAILABLE",
    limitations,
  };
}
