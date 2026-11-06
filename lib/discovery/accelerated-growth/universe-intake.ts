/**
 * AG market-universe intake v1. Auditable breadth FIRST, NOT a research rank.
 *
 * Capture every eligible row returned by consecutive FMP stock-screener
 * pages in provider order. Never alphabetically sample, select 12, reserve
 * thesis-path quotas, claim unsampled pages were examined, or infer a BUY.
 *
 * FMP screener prices do not carry an issuer-specific quote timestamp. They
 * must NOT be treated as independently verified, decision-grade prices.
 */
export const AG_UNIVERSE_INTAKE_VERSION = "ag-universe-intake-v1";
export const AG_UNIVERSE_SOURCE = "https://financialmodelingprep.com/stable/company-screener";
export const AG_UNIVERSE_FILTERS = {
  country: "US",
  marketCapMoreThan: "50000000",
  priceMoreThan: "1",
  avgVolumeMoreThan: "100000",
  isEtf: "false",
  isFund: "false",
  isActivelyTrading: "true",
} as const;
export type RawScreenerRow = Record<string, unknown>;
export type IntakeCandidate = {
  symbol: string;
  companyName: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  marketCapUsdVendor: number;
  screenerPriceUsdUnverified: number;
  observedVolume: number | null;
  providerPage: number;
  providerRow: number;
  source: typeof AG_UNIVERSE_SOURCE;
  issuerVerified: false;
  quoteVerified: false;
  valuationVerified: false;
  researchRank: null;
};
export type UniverseIntake = {
  version: typeof AG_UNIVERSE_INTAKE_VERSION;
  source: typeof AG_UNIVERSE_SOURCE;
  query: typeof AG_UNIVERSE_FILTERS;
  startedAt: string;
  finishedAt: string;
  pagesRequested: number;
  pageSize: number;
  pageCounts: number[];
  providerRowsSeen: number;
  eligibleRows: number;
  rejectedRows: number;
  rejectionReasons: Record<string, number>;
  sectorsSeen: Record<string, number>;
  exchangesSeen: Record<string, number>;
  coverage: "PROVIDER_PAGE_EXHAUSTED" | "CAPPED_UNVERIFIED";
  allUSMarketsCovered: false;
  economicRankingPerformed: false;
  researchDecisionsIssued: 0;
  tradesEnabled: false;
  candidates: IntakeCandidate[];
  limitations: string[];
};
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const validSymbol = (s: string) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);
const exchanges = new Set(["NASDAQ", "NYSE", "AMEX", "NYSE AMERICAN"]);
const ISO = (s: string) => Number.isFinite(Date.parse(s));
const increment = (obj: Record<string, number>, key: string) => {
  obj[key] = (obj[key] ?? 0) + 1;
};
const rejected = (row: RawScreenerRow): string | null => {
  const symbol = text(row.symbol).toUpperCase();
  if (!validSymbol(symbol) || !text(row.companyName)) return "UNUSABLE_IDENTITY";
  if (text(row.country).toUpperCase() !== "US") return "NON_US_OR_MISSING_COUNTRY";
  if (!exchanges.has(text(row.exchangeShortName).toUpperCase()))
    return "OUT_OF_SCOPE_EXCHANGE";
  if (row.isEtf !== false || row.isFund !== false ||
      row.isActivelyTrading !== true) return "INSTRUMENT_TYPE_UNVERIFIED";
  if (!finite(row.marketCap) || row.marketCap <= 50_000_000 ||
      !finite(row.price) || row.price <= 1)
    return "MARKET_CAP_OR_PRICE_SCREEN_FAILED";
  if (row.volume !== undefined && row.volume !== null &&
      (!finite(row.volume) || row.volume < 0)) return "INVALID_VOLUME";
  return null;
};

export async function collectAgUniverse(
  fetchPage: (page: number, limit: number) => Promise<unknown>,
  options: { maxPages: number; pageSize: number; startedAt: string; finishedAt: () => string },
): Promise<UniverseIntake> {
  const {maxPages,pageSize,startedAt,finishedAt} = options;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250 ||
      !ISO(startedAt) || typeof fetchPage !== "function" ||
      typeof finishedAt !== "function")
    throw new Error("AG_UNIVERSE_INVALID_SCOPE");

  const candidates: IntakeCandidate[] = [];
  const pageCounts: number[] = [], rejectionReasons: Record<string, number> = {};
  const sectorsSeen: Record<string, number> = {}, exchangesSeen: Record<string, number> = {};
  const symbols = new Set<string>(), pageSignatures = new Set<string>();
  let providerRowsSeen = 0;
  let coverage: UniverseIntake["coverage"] = "CAPPED_UNVERIFIED";
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(page,pageSize);
    if (!Array.isArray(result) || result.length > pageSize)
      throw new Error("AG_UNIVERSE_INVALID_PROVIDER_PAGE");
    const rows = result as unknown[];
    const signature = rows.map(r => r && typeof r === "object" && !Array.isArray(r)
      ? text((r as RawScreenerRow).symbol).toUpperCase() : "!invalid").join("|");
    if (pageSignatures.has(signature) && rows.length > 0)
      throw new Error("AG_UNIVERSE_REPEAT_PROVIDER_PAGE");
    pageSignatures.add(signature);
    pageCounts.push(rows.length);
    providerRowsSeen += rows.length;
    for (const [idx,raw] of rows.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        increment(rejectionReasons,"INVALID_PROVIDER_ROW");
        continue;
      }
      const row = raw as RawScreenerRow, symbol = text(row.symbol).toUpperCase();
      if (validSymbol(symbol)) {
        if (symbols.has(symbol)) throw new Error("AG_UNIVERSE_DUPLICATE_SYMBOL");
        symbols.add(symbol);
      }
      const reason = rejected(row);
      if (reason) { increment(rejectionReasons,reason); continue; }
      const sector = text(row.sector) || null;
      const exchange = text(row.exchangeShortName).toUpperCase();
      increment(sectorsSeen,sector ?? "UNKNOWN");
      increment(exchangesSeen,exchange);
      candidates.push({
        symbol,companyName:text(row.companyName),exchange,sector,
        industry:text(row.industry)||null,
        marketCapUsdVendor:row.marketCap as number,
        screenerPriceUsdUnverified:row.price as number,
        observedVolume:finite(row.volume)?row.volume:null,
        providerPage:page,providerRow:idx,source:AG_UNIVERSE_SOURCE,
        issuerVerified:false,quoteVerified:false,valuationVerified:false,
        researchRank:null,
      });
    }
    if (rows.length < pageSize) { coverage = "PROVIDER_PAGE_EXHAUSTED"; break; }
  }
  const ended = finishedAt();
  if (!ISO(ended) || Date.parse(ended)<Date.parse(startedAt))
    throw new Error("AG_UNIVERSE_INVALID_COMPLETION_TIME");
  return {
    version:AG_UNIVERSE_INTAKE_VERSION,
    source:AG_UNIVERSE_SOURCE,query:AG_UNIVERSE_FILTERS,
    startedAt,finishedAt:ended,pagesRequested:pageCounts.length,
    pageSize,pageCounts,providerRowsSeen,eligibleRows:candidates.length,
    rejectedRows:providerRowsSeen-candidates.length,rejectionReasons,
    sectorsSeen,exchangesSeen,coverage,allUSMarketsCovered:false,
    economicRankingPerformed:false,researchDecisionsIssued:0,
    tradesEnabled:false,candidates,
    limitations:[
      "US listed actively trading common-stock-like screener rows only; instrument/issuer identity must be verified later.",
      "Coverage is bounded by provider filters and requested pages; even page exhaustion does not imply the entire US market.",
      "FMP screener prices and volumes have no issuer-specific timestamp here; they are not independently verified quote evidence.",
      "This intake reports breadth, sector and exchange coverage, but deliberately does not rank securities by market cap, ticker, price or liquidity.",
      "Financial inflection, turnaround, catalysts, cash conversion, dilution and price-implied economics require independent dated evidence.",
      "No options, sector funds, commodity exposure, non-US opportunities or special-situation instruments are claimed covered.",
      "No Committee BUY/WATCH/REJECT, trade, portfolio sizing, orders or funding operations are performed.",
    ],
  };
}
