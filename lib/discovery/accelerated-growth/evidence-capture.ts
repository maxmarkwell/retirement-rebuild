import "server-only";

/**
 * One-company live financial-evidence capture for AG Release 2C.
 * Same-provider comparisons are not independent issuer verification.
 * Records are research-only: no thesis, BUY decision, or price targets.
 */
export const VERSION = "ag-evidence-capture-v1";
export type Evidence = {
  symbol: string;
  issuerName: string;
  exchange: string | null;
  currency: string | null;
  price: number;
  marketCap: number | null;
  revenue: number;
  operatingIncome: number | null;
  netIncome: number | null;
  fiscalPeriodEnd: string;
  filedDate: string;
  capturedAt: string;
  sourceKind: "FMP_PROFILE_QUOTE_ANNUAL_INCOME";
  primaryFilingUrl: string | null;
  identityStatus: "CONSISTENT_VENDOR_ONLY";
  limitations: string[];
};

type VendorRow = Record<string, unknown>;
const norm = (x: unknown) => typeof x === "string" ? x.trim().toUpperCase() : "";
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const dateOnly = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x + "T00:00:00Z"));

export function validateEvidence(symbol: string, profile: unknown, quote: unknown,
  income: unknown, capturedAt: string): Evidence {
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) ||
      !profile || typeof profile !== "object" || !quote || typeof quote !== "object" ||
      !income || typeof income !== "object" ||
      !Number.isFinite(Date.parse(capturedAt))) throw new Error("AG_EVIDENCE_INVALID_DATA");
  const p = profile as VendorRow, q = quote as VendorRow, f = income as VendorRow;
  if (norm(p.symbol) !== symbol || norm(q.symbol) !== symbol || norm(f.symbol) !== symbol)
    throw new Error("AG_EVIDENCE_SYMBOL_MISMATCH");
  const name = typeof p.companyName === "string" ? p.companyName.trim() : "";
  if (name.length < 3) throw new Error("AG_EVIDENCE_ISSUER_NAME_MISSING");
  const px = norm(p.exchangeShortName ?? p.exchange), qx = norm(q.exchangeShortName ?? q.exchange);
  const pc = norm(p.currency), qc = norm(q.currency);
  const pi = norm(p.isin), qi = norm(q.isin);
  if (px && qx && px !== qx || pc && qc && pc !== qc || pi && qi && pi !== qi)
    throw new Error("AG_EVIDENCE_SECURITY_IDENTITY_CONFLICT");
  if (!finite(q.price) || q.price <= 0 || !finite(f.revenue) || f.revenue <= 0)
    throw new Error("AG_EVIDENCE_FINANCIALS_UNAVAILABLE");
  const fiscalPeriodEnd = f.date;
  const filedDate = f.filingDate ?? f.fillingDate;
  if (!dateOnly(fiscalPeriodEnd) || !dateOnly(filedDate) ||
      Date.parse(filedDate + "T00:00:00Z") > Date.parse(capturedAt) ||
      Date.parse(fiscalPeriodEnd + "T00:00:00Z") > Date.parse(filedDate + "T00:00:00Z"))
    throw new Error("AG_EVIDENCE_FILING_DATE_INVALID");
  const urlCandidate = f.finalLink ?? f.link;
  let primaryFilingUrl: string | null = null;
  if (typeof urlCandidate === "string") {
    try {
      const link = new URL(urlCandidate);
      if (link.protocol === "https:" && (link.hostname === "sec.gov" || link.hostname.endsWith(".sec.gov")) &&
          !link.username && !link.password) primaryFilingUrl = link.toString();
    } catch { /* Non-SEC or invalid links are not treated as primary sources. */ }
  }
  return {
    symbol, issuerName: name, exchange: px || qx || null, currency: pc || qc || null,
    price: q.price as number, marketCap: finite(q.marketCap) && q.marketCap > 0 ? q.marketCap : null,
    revenue: f.revenue as number,
    operatingIncome: finite(f.operatingIncome) ? f.operatingIncome : null,
    netIncome: finite(f.netIncome) ? f.netIncome : null,
    fiscalPeriodEnd, filedDate, capturedAt,
    sourceKind: "FMP_PROFILE_QUOTE_ANNUAL_INCOME", primaryFilingUrl,
    identityStatus: "CONSISTENT_VENDOR_ONLY",
    limitations: [
      "Profile, quote, and financial statement are from the same vendor; issuer identity is not independently verified.",
      "Quote captured at retrieval time, not an authenticated historical exchange timestamp.",
      ...(primaryFilingUrl ? [] : ["No SEC primary filing URL confirmed; financial data is vendor-sourced only."]),
    ],
  };
}

async function fetchRows(endpoint: string, symbol: string, apiKey: string) {
  const url = new URL("https://financialmodelingprep.com/stable/" + endpoint);
  url.searchParams.set("symbol", symbol);
  if (endpoint === "income-statement") {
    url.searchParams.set("period", "annual");
    url.searchParams.set("limit", "1");
  }
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(16000) });
  if (!response.ok) throw new Error("AG_EVIDENCE_PROVIDER_UNAVAILABLE");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0] || typeof rows[0] !== "object")
    throw new Error("AG_EVIDENCE_PROVIDER_EMPTY");
  return rows[0] as VendorRow;
}

export async function captureAgFinancialEvidence(symbol: string): Promise<Evidence> {
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_EVIDENCE_INVALID_SYMBOL");
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("AG_EVIDENCE_PROVIDER_NOT_CONFIGURED");
  const [profile, quote, annual] = await Promise.all([
    fetchRows("profile", symbol, key),
    fetchRows("quote", symbol, key),
    fetchRows("income-statement", symbol, key),
  ]);
  return validateEvidence(symbol, profile, quote, annual, new Date().toISOString());
}
