import { getCompanyFundamentals } from "@/lib/company-data/fmp";

export type AgValuationSnapshot = {
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

export async function getAgValuationSnapshot(symbol: string): Promise<AgValuationSnapshot> {
  const f = await getCompanyFundamentals(symbol);
  const marketCap = valid(f.marketCap);
  const enterpriseValue = valid(f.enterpriseValue);
  const annualRevenue = valid(f.revenue);
  const annualNetIncome = valid(f.netIncome);
  const annualFreeCashFlow = valid(f.freeCashFlow);
  const limitations = [
    "FMP market values may be cached for up to one hour; fetchedAt is not the market quote timestamp.",
    "Financial statement values are latest annual, NOT trailing twelve months; fiscal period end is not available in this adapter.",
    "Share price, balance-sheet cash/debt timestamps, and independently verified SEC provenance are not included.",
  ];
  if (marketCap == null) limitations.push("Market capitalization unavailable.");
  if (enterpriseValue == null) limitations.push("Enterprise value unavailable.");
  if (annualRevenue == null) limitations.push("Annual revenue unavailable.");
  return {
    symbol, fetchedAt: new Date().toISOString(), source: "FMP",
    marketCap, enterpriseValue, annualRevenue, annualNetIncome, annualFreeCashFlow,
    priceToSales: multiple(marketCap, annualRevenue),
    priceToEarnings: multiple(marketCap, annualNetIncome),
    priceToFreeCashFlow: multiple(marketCap, annualFreeCashFlow),
    evToSales: multiple(enterpriseValue, annualRevenue),
    dataQuality: marketCap != null && annualRevenue != null ? "PARTIAL" : "UNAVAILABLE",
    limitations,
  };
}
