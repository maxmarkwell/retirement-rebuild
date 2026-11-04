import "server-only";

/**
 * SEC-issued issuer and filing-metadata cross-reference (NOT financial-fact verification).
 * A source row must already have passed the independent AG vendor evidence capture.
 */
export const SEC_VERIFY_VERSION = "ag-sec-issuer-v1";
export type SecEvidence = {
  symbol: string;
  cik: string;
  secName: string;
  vendorIssuerName: string;
  nameComparison: "NORMALIZED_MATCH";
  tickerListedInSecSubmissions: boolean;
  secTickerMapUrl: string;
  secSubmissionsUrl: string;
  form: "10-K";
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  filingUrl: string;
  vendorFilingDate: string;
  vendorFiscalEnd: string;
  vendorCaptureTime: string;
  capturedAt: string;
  verification: "SEC_ISSUER_AND_FILING_METADATA_MATCH";
  limitations: string[];
};

type Row = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const isoDate = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));
const nameKey = (v: unknown) => str(v).toUpperCase()
  .replace(/\bCORPORATION\b/g, "CORP")
  .replace(/\bINCORPORATED\b/g, "INC")
  .replace(/[^A-Z0-9]/g, "");
export function reconcileSecIssuer(input: {
  symbol: string;
  vendorIssuerName: string;
  vendorFiscalEnd: string;
  vendorFilingDate: string;
  vendorCaptureTime: string;
}, tickerMap: unknown, submissions: unknown, capturedAt: string): SecEvidence {
  const { symbol, vendorIssuerName, vendorFiscalEnd, vendorFilingDate, vendorCaptureTime } = input;
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) ||
      !Array.isArray(tickerMap) || !submissions || typeof submissions !== "object" ||
      !isoDate(vendorFilingDate) || !isoDate(vendorFiscalEnd) ||
      !Number.isFinite(Date.parse(vendorCaptureTime)) || !Number.isFinite(Date.parse(capturedAt)))
    throw new Error("AG_SEC_INVALID_INPUT");
  const matches = tickerMap.filter(x => x && typeof x === "object" &&
    str((x as Row).ticker).toUpperCase() === symbol) as Row[];
  if (matches.length !== 1 || !Number.isInteger(matches[0].cik_str) ||
      Number(matches[0].cik_str) < 1) throw new Error("AG_SEC_TICKER_NOT_UNIQUE");
  const cikNumber = Number(matches[0].cik_str);
  const cik = String(cikNumber).padStart(10, "0");
  const sec = submissions as Row;
  if (Number(sec.cik) !== cikNumber || !Array.isArray(sec.tickers) ||
      !sec.tickers.some(t => str(t).toUpperCase() === symbol)) throw new Error("AG_SEC_CIK_OR_TICKER_MISMATCH");
  const secName = str(sec.name);
  if (nameKey(vendorIssuerName).length < 5 || nameKey(vendorIssuerName) !== nameKey(secName) ||
      nameKey(vendorIssuerName) !== nameKey(matches[0].title))
    throw new Error("AG_SEC_ISSUER_NAME_MISMATCH");
  const recent = (sec.filings as Row | undefined)?.recent as Row | undefined;
  const forms = recent?.form, accessions = recent?.accessionNumber;
  const dates = recent?.filingDate, reports = recent?.reportDate, documents = recent?.primaryDocument;
  if (![forms,accessions,dates,reports,documents].every(Array.isArray)) throw new Error("AG_SEC_FILINGS_MISSING");
  const rows = forms as unknown[];
  const filingDates = dates as unknown[];
  const reportDates = reports as unknown[];
  const accessionNumbers = accessions as unknown[];
  const primaryDocuments = documents as unknown[];
  if (![filingDates, reportDates, accessionNumbers, primaryDocuments]
      .every(items => items.length === rows.length)) throw new Error("AG_SEC_FILINGS_MALFORMED");
  let matchIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] === "10-K" && filingDates[i] === vendorFilingDate &&
        reportDates[i] === vendorFiscalEnd) {
      if (matchIndex !== -1) throw new Error("AG_SEC_AMBIGUOUS_FILING");
      matchIndex = i;
    }
  }
  if (matchIndex < 0) throw new Error("AG_SEC_FILING_NOT_RECONCILED");
  const accession = str(accessionNumbers[matchIndex]), doc = str(primaryDocuments[matchIndex]);
  if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(doc) ||
      doc.includes("..")) throw new Error("AG_SEC_INVALID_FILING_METADATA");
  if (Date.parse(vendorFilingDate + "T00:00:00Z") > Date.parse(vendorCaptureTime))
    throw new Error("AG_SEC_FILING_FUTURE");
  const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accession.replace(/-/g, "")}/${doc}`;
  return {
    symbol, cik, secName, vendorIssuerName, nameComparison: "NORMALIZED_MATCH",
    tickerListedInSecSubmissions: true,
    secTickerMapUrl: "https://www.sec.gov/files/company_tickers.json",
    secSubmissionsUrl: `https://data.sec.gov/submissions/CIK${cik}.json`,
    form: "10-K", accessionNumber: accession, filingDate: vendorFilingDate,
    reportDate: vendorFiscalEnd, filingUrl, vendorFilingDate, vendorFiscalEnd,
    vendorCaptureTime, capturedAt,
    verification: "SEC_ISSUER_AND_FILING_METADATA_MATCH",
    limitations: [
      "SEC metadata confirms issuer, ticker, CIK, and matching 10-K submission dates, not the vendor's revenue or stock price.",
      "The filing URL is constructed from SEC submission metadata; filing document contents are not yet reconciled.",
      "This verification covers US SEC 10-K filings only; foreign filers using 20-F or 40-F require a separate route.",
    ],
  };
}

async function secJson(url: string, userAgent: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store", signal: AbortSignal.timeout(18000),
    headers: { "User-Agent": userAgent, "Accept": "application/json" },
  });
  if (!response.ok) throw new Error("AG_SEC_PROVIDER_UNAVAILABLE");
  return response.json();
}

export async function verifyAgSecIssuer(input: {
  symbol: string; vendorIssuerName: string; vendorFiscalEnd: string;
  vendorFilingDate: string; vendorCaptureTime: string;
}): Promise<SecEvidence> {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent || userAgent.trim().length < 8) throw new Error("AG_SEC_USER_AGENT_REQUIRED");
  const mapRaw = await secJson("https://www.sec.gov/files/company_tickers.json", userAgent);
  if (!mapRaw || typeof mapRaw !== "object" || Array.isArray(mapRaw))
    throw new Error("AG_SEC_TICKER_MAP_UNAVAILABLE");
  const tickerMap = Object.values(mapRaw);
  const entries = tickerMap.filter(x => x && typeof x === "object" &&
    str((x as Row).ticker).toUpperCase() === input.symbol) as Row[];
  if (entries.length !== 1 || !Number.isInteger(entries[0].cik_str))
    throw new Error("AG_SEC_TICKER_NOT_UNIQUE");
  const cik = String(entries[0].cik_str).padStart(10,"0");
  const submissions = await secJson(`https://data.sec.gov/submissions/CIK${cik}.json`, userAgent);
  return reconcileSecIssuer(input, tickerMap, submissions, new Date().toISOString());
}
