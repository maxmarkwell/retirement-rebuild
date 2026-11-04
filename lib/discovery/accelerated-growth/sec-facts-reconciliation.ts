import "server-only";

/**
 * Release 2E: compare the ORIGINAL 10-K's annual us-gaap USD XBRL facts
 * against the already saved FMP annual income statement for that year.
 * Never use frame/fy alone: comparative historical facts may be repeated in
 * subsequent 10-Ks and must not silently substitute for the target filing.
 */
export const AG_SEC_FACTS_VERSION = "ag-sec-facts-v1";
export type MetricName = "revenue" | "operatingIncome" | "netIncome";
export type MetricComparison = {
  name: MetricName;
  vendorValue: number | null;
  secValue: number | null;
  secTag: string | null;
  secAccession: string | null;
  secStart: string | null;
  secEnd: string | null;
  secFiled: string | null;
  unit: "USD";
  absoluteDifference: number | null;
  relativeDifference: number | null;
  status: "MATCH" | "MISMATCH" | "MISSING_VENDOR" | "MISSING_SEC" | "AMBIGUOUS_SEC";
};
export type FactsReconciliation = {
  version: typeof AG_SEC_FACTS_VERSION;
  symbol: string;
  cik: string;
  accessionNumber: string;
  filedDate: string;
  fiscalEnd: string;
  secFactsUrl: string;
  capturedAt: string;
  result: "MATCH" | "NEEDS_REVIEW";
  metrics: MetricComparison[];
  limitations: string[];
};
export type FactsInput = {
  symbol: string;
  cik: string;
  accessionNumber: string;
  filedDate: string;
  fiscalEnd: string;
  vendorRevenue: number | null;
  vendorOperatingIncome: number | null;
  vendorNetIncome: number | null;
};
type JsonObject = Record<string, unknown>;
const isRecord = (x: unknown): x is JsonObject =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const dateOk = (x: unknown): x is string =>
  typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x + "T00:00:00Z"));
const targetTags: Record<MetricName, string[]> = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
  ],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
};
const MS_DAY = 86400000;
function annualFactRows(facts: JsonObject, tag: string, input: FactsInput) {
  const entry = isRecord(facts[tag]) ? facts[tag] : null;
  const units = entry && isRecord(entry.units) ? entry.units : null;
  const usd = units?.USD;
  if (!Array.isArray(usd)) return [];
  return usd.filter((row): row is JsonObject => {
    if (!isRecord(row)) return false;
    if (row.accn !== input.accessionNumber ||
        row.form !== "10-K" || row.filed !== input.filedDate ||
        row.end !== input.fiscalEnd || !dateOk(row.start) ||
        !finite(row.val)) return false;
    const spanDays = (Date.parse(input.fiscalEnd + "T00:00:00Z") -
      Date.parse(row.start + "T00:00:00Z")) / MS_DAY;
    return spanDays >= 330 && spanDays <= 380;
  });
}
function compareMetric(name: MetricName, vendorValue: number | null,
  facts: JsonObject, input: FactsInput): MetricComparison {
  const candidates: { tag: string; row: JsonObject }[] = [];
  for (const tag of targetTags[name]) {
    for (const row of annualFactRows(facts, tag, input)) candidates.push({ tag, row });
  }
  const distinct = new Set(candidates.map(({ row }) => `${row.start}|${row.end}|${row.val}`));
  const selected = candidates[0];
  const secValue = selected && finite(selected.row.val) ? selected.row.val : null;
  const ambiguous = distinct.size > 1;
  const delta = vendorValue !== null && secValue !== null
    ? Math.abs(vendorValue - secValue) : null;
  const relativeDifference = delta === null || vendorValue === null || secValue === null
    ? null : delta / Math.max(Math.abs(vendorValue), Math.abs(secValue), 1);
  // FMP income statement rounds some reported values. Allow max($1m, 0.5%).
  const tolerated = vendorValue !== null && secValue !== null
    ? Math.max(1_000_000, 0.005 * Math.max(Math.abs(vendorValue), Math.abs(secValue))) : 0;
  const status: MetricComparison["status"] =
    vendorValue === null ? "MISSING_VENDOR" :
    ambiguous ? "AMBIGUOUS_SEC" :
    secValue === null ? "MISSING_SEC" :
    delta !== null && delta <= tolerated ? "MATCH" : "MISMATCH";
  return {
    name, vendorValue, secValue: ambiguous ? null : secValue,
    secTag: !ambiguous && selected ? selected.tag : null,
    secAccession: selected ? input.accessionNumber : null,
    secStart: !ambiguous && selected ? String(selected.row.start) : null,
    secEnd: !ambiguous && selected ? String(selected.row.end) : null,
    secFiled: !ambiguous && selected ? String(selected.row.filed) : null,
    unit: "USD", absoluteDifference: ambiguous ? null : delta,
    relativeDifference: ambiguous ? null : relativeDifference,
    status,
  };
}
export function reconcileCompanyFacts(input: FactsInput, raw: unknown,
  capturedAt: string): FactsReconciliation {
  if (!/^\d{10}$/.test(input.cik) || !/^\d{10}-\d{2}-\d{6}$/.test(input.accessionNumber) ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol) ||
      !dateOk(input.filedDate) || !dateOk(input.fiscalEnd) ||
      !Number.isFinite(Date.parse(capturedAt)) ||
      Date.parse(input.filedDate + "T00:00:00Z") > Date.parse(capturedAt) ||
      !isRecord(raw) || Number(raw.cik) !== Number(input.cik) || !isRecord(raw.facts) ||
      !isRecord(raw.facts["us-gaap"]))
    throw new Error("AG_SEC_FACTS_IDENTITY_OR_FORMAT_INVALID");
  const gaap = raw.facts["us-gaap"] as JsonObject;
  const values = [input.vendorRevenue, input.vendorOperatingIncome, input.vendorNetIncome];
  if (values.some(v => v !== null && !finite(v)) ||
      (input.vendorRevenue !== null && input.vendorRevenue <= 0))
    throw new Error("AG_SEC_FACTS_VENDOR_INVALID");
  const metrics: MetricComparison[] = [
    compareMetric("revenue", input.vendorRevenue, gaap, input),
    compareMetric("operatingIncome", input.vendorOperatingIncome, gaap, input),
    compareMetric("netIncome", input.vendorNetIncome, gaap, input),
  ];
  return {
    version: AG_SEC_FACTS_VERSION, symbol: input.symbol, cik: input.cik,
    accessionNumber: input.accessionNumber, filedDate: input.filedDate,
    fiscalEnd: input.fiscalEnd,
    secFactsUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${input.cik}.json`,
    capturedAt,
    result: metrics.every(x => x.status === "MATCH") ? "MATCH" : "NEEDS_REVIEW",
    metrics,
    limitations: [
      "Only SEC entity-wide us-gaap annual USD facts from the exact matched 10-K accession are compared.",
      "A MATCH is a tolerance-based numeric reconciliation, not an investment recommendation or accounting audit.",
      "Company-specific extension tags, non-USD and unavailable metrics remain unverified.",
    ],
  };
}
export async function captureSecCompanyFacts(input: FactsInput): Promise<FactsReconciliation> {
  const userAgent = process.env.SEC_USER_AGENT;
  if (!userAgent || userAgent.trim().length < 8)
    throw new Error("AG_SEC_FACTS_USER_AGENT_REQUIRED");
  if (!/^\d{10}$/.test(input.cik)) throw new Error("AG_SEC_FACTS_INVALID_CIK");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${input.cik}.json`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!response.ok) throw new Error("AG_SEC_FACTS_PROVIDER_UNAVAILABLE");
  return reconcileCompanyFacts(input, await response.json(), new Date().toISOString());
}
