import { getCompanyFundamentals } from "@/lib/company-data/fmp";

export type AgValuationSnapshot = {
  version: "ag-valuation-v4";
  reconciliation: { quotePrice: number | null; quoteTimestamp: string | null; reportedSharesOutstanding: number | null; shareCountDate: string | null; shareCountSource: string | null; impliedSharesFromVendorMarketCap: number | null; shareCountDifferencePct: number | null; shareCountStatus: "CONSISTENT" | "MISMATCH" | "UNVERIFIED"; computedMarketCap: number | null; marketCapDifferencePct: number | null; marketCapStatus: "MATCH" | "MISMATCH" | "UNVERIFIED"; balanceSheetDate: string | null; balanceSheetCash: number | null; balanceSheetDebt: number | null; computedEnterpriseValue: number | null; enterpriseValueDifferencePct: number | null; enterpriseValueStatus: "MATCH" | "MISMATCH" | "UNVERIFIED"; };
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

type Quote = { price?: number; timestamp?: number; marketCap?: number };
type Balance = { date?: string; cashAndCashEquivalents?: number; totalDebt?: number; commonStockSharesOutstanding?: number };
async function fmpRows<T>(endpoint: string, symbol: string): Promise<T[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("FMP_API_KEY missing");
  const url = new URL("https://financialmodelingprep.com/stable/" + endpoint);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", key);
  if (endpoint === "balance-sheet-statement") { url.searchParams.set("period", "quarter"); url.searchParams.set("limit", "1"); }
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(endpoint + " status " + response.status);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error(endpoint + " invalid response");
  return data as T[];
}
const percentDifference = (a: number | null, b: number | null): number | null =>
  a != null && b != null && a > 0 && b > 0 ? Math.abs(a-b)/Math.max(a,b)*100 : null;
const status = (difference: number | null): "MATCH" | "MISMATCH" | "UNVERIFIED" =>
  difference == null ? "UNVERIFIED" : difference <= 5 ? "MATCH" : "MISMATCH";

export async function getAgValuationSnapshot(symbol: string): Promise<AgValuationSnapshot> {
  const f = await getCompanyFundamentals(symbol);
  const quarterResult = await getQuarterly(symbol).then(rows => ({rows,error:null as string | null})).catch(e => ({rows:[] as Quarter[],error:String(e)}));
  const ttm=computeTtm(quarterResult.rows);
  const [quoteResult, balanceResult] = await Promise.all([
    fmpRows<Quote>("quote", symbol).then(rows => ({ row: rows[0] ?? null, error: null as string | null }))
      .catch(e => ({ row: null as Quote | null, error: String(e) })),
    fmpRows<Balance>("balance-sheet-statement", symbol).then(rows => ({ row: rows[0] ?? null, error: null as string | null }))
      .catch(e => ({ row: null as Balance | null, error: String(e) })),
  ]);
  const marketCap = valid(f.marketCap);
  const enterpriseValue = valid(f.enterpriseValue);
  const annualRevenue = valid(f.revenue);
  const annualNetIncome = valid(f.netIncome);
  const annualFreeCashFlow = valid(f.freeCashFlow);
  const quotePrice = valid(quoteResult.row?.price ?? null);
  const quoteTimestamp = typeof quoteResult.row?.timestamp === "number" && Number.isFinite(quoteResult.row.timestamp)
    ? new Date(quoteResult.row.timestamp * 1000).toISOString() : null;
  // Dated balance-sheet shares are historical; never label this a current independent market-cap verification.
  const reportedSharesOutstanding = valid(balanceResult.row?.commonStockSharesOutstanding ?? null);
  const shareCountDate = reportedSharesOutstanding != null ? balanceResult.row?.date ?? null : null;
  const shareCountSource = reportedSharesOutstanding != null ? "FMP quarterly balance sheet" : null;
  const impliedSharesFromVendorMarketCap = marketCap != null && quotePrice != null && quotePrice > 0
    ? marketCap / quotePrice : null;
  const shareCountDifferencePct = percentDifference(reportedSharesOutstanding, impliedSharesFromVendorMarketCap);
  const shareCountStatus = shareCountDifferencePct == null ? "UNVERIFIED"
    : shareCountDifferencePct > 5 ? "MISMATCH" : "CONSISTENT";
  const computedMarketCap = reportedSharesOutstanding != null && quotePrice != null
    ? reportedSharesOutstanding * quotePrice : null;
  const marketCapDifferencePct = percentDifference(marketCap, valid(quoteResult.row?.marketCap ?? null));
  const balanceSheetCash = valid(balanceResult.row?.cashAndCashEquivalents ?? null);
  const balanceSheetDebt = valid(balanceResult.row?.totalDebt ?? null);
  const computedEnterpriseValue = marketCap != null && balanceSheetCash != null && balanceSheetDebt != null
    ? marketCap + balanceSheetDebt - balanceSheetCash : null;
  const enterpriseValueDifferencePct = percentDifference(enterpriseValue, computedEnterpriseValue);
  const reconciliation = {
    quotePrice, quoteTimestamp, reportedSharesOutstanding, shareCountDate, shareCountSource,
    impliedSharesFromVendorMarketCap, shareCountDifferencePct, shareCountStatus, computedMarketCap,
    marketCapDifferencePct, marketCapStatus: status(marketCapDifferencePct),
    balanceSheetDate: balanceResult.row?.date ?? null,
    balanceSheetCash, balanceSheetDebt, computedEnterpriseValue,
    enterpriseValueDifferencePct, enterpriseValueStatus: status(enterpriseValueDifferencePct),
  };
  const limitations = [
    "FMP market values may be cached for up to one hour; fetchedAt is not the market quote timestamp.",
    "Annual financial values are context only, NOT trailing twelve months; fiscal period end is unavailable.",
    "TTM values are calculated from four dated FMP quarters but not reconciled to SEC filings.",
    "TTM free cash flow is unavailable; annual free cash flow is not a TTM substitute.",
    "Quote timestamp may be unavailable; fetchedAt is not a quote timestamp.",
    "Shares outstanding are sourced from a dated quarterly FMP balance sheet, not an independent live share register.",
    "Historical shares times a later quoted price is a diagnostic, not a contemporaneous market-cap calculation.",
    "Market-cap MATCH compares two endpoints from the same vendor and does not validate share count.",
    "Enterprise value approximation is market cap + reported debt - reported cash; minority interest, leases and other adjustments may be excluded.",
    "Market valuation and balance sheet may have different effective dates; SEC provenance remains unverified.",
  ];
  if (shareCountStatus === "MISMATCH") limitations.push("Historical reported shares disagree with shares implied by vendor market cap / quoted price by more than 5%; investigate corporate actions, dilution, and dates.");
  if (shareCountStatus === "UNVERIFIED") limitations.push("Share-count consistency could not be evaluated.");
  if (quoteResult.error) limitations.push("Quote retrieval: " + quoteResult.error);
  if (balanceResult.error) limitations.push("Balance-sheet retrieval: " + balanceResult.error);
  if (reconciliation.marketCapStatus === "MISMATCH") limitations.push("FMP quote market cap differs from FMP profile market cap by more than 5%.");
  if (reconciliation.enterpriseValueStatus === "MISMATCH") limitations.push("Vendor enterprise value differs from simplified balance-sheet reconstruction by more than 5%.");
  if (quarterResult.error) limitations.push("Quarterly fetch: "+quarterResult.error);
  if (ttm.error) limitations.push("TTM validation: "+ttm.error);
  if (marketCap == null) limitations.push("Market capitalization unavailable.");
  if (enterpriseValue == null) limitations.push("Enterprise value unavailable.");
  if (annualRevenue == null) limitations.push("Annual revenue unavailable.");
  return {
    version: "ag-valuation-v3", reconciliation, ttmRevenue: ttm.revenue, ttmNetIncome: ttm.netIncome, ttmQuarterEnds: ttm.dates,
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
