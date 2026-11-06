/**
 * Historical US-GAAP capital/economics evidence from the EXACT SEC 10-K.
 * This is a pure extraction/quality gate, not a projection or valuation.
 *
 * CFO - capex is a historical levered-FCF proxy, NOT unlevered FCF.
 * Historical diluted weighted-average shares are NOT terminal shares.
 * Debt coverage excludes other borrowing obligations until independently reconciled.
 */
export const AG_HISTORICAL_BASELINE_VERSION = "ag-historical-baseline-v1";
export type FactStatus = "VERIFIED" | "MISSING" | "AMBIGUOUS";
export type SourcedFact = {
  status: FactStatus;
  amount: number | null;
  tag: string | null;
  unit: "USD" | "shares";
  start: string | null;
  end: string;
  accession: string;
  filed: string;
  basis: "ANNUAL_DURATION" | "FISCAL_END_INSTANT";
};
export type AnnualHistoricalBaseline = {
  version: typeof AG_HISTORICAL_BASELINE_VERSION;
  symbol: string;
  cik: string;
  secCompanyFactsUrl: string;
  accession: string;
  filingDate: string;
  fiscalStart: string;
  fiscalEnd: string;
  facts: {
    cashFromOperations: SourcedFact;
    capitalExpenditures: SourcedFact;
    historicalDilutedWeightedAverageShares: SourcedFact;
    cashAndCashEquivalents: SourcedFact;
    currentLongTermDebt: SourcedFact;
    noncurrentLongTermDebt: SourcedFact;
  };
  historicalLeveredFcfProxyUsd: number | null;
  narrowReportedNetDebtUsd: number | null;
  status: "COMPLETE_NARROW_BASELINE" | "INCOMPLETE_OR_AMBIGUOUS";
  eligibleAsUnleveredFcfForecast: false;
  eligibleAsTerminalShareForecast: false;
  readyForValuation: false;
  limitations: string[];
};
export type AnnualHistoricalBaselineInput = {
  symbol: string;
  cik: string;
  accession: string;
  filingDate: string;
  fiscalStart: string;
  fiscalEnd: string;
};
type Obj = Record<string, unknown>;
const obj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const date = (x: unknown): x is string => typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x + "T00:00:00Z"));
const number = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const MS_DAY = 86400000;
const tagSets = {
  cashFromOperations: ["NetCashProvidedByUsedInOperatingActivities"],
  capitalExpenditures: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  historicalDilutedWeightedAverageShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  cashAndCashEquivalents: ["CashAndCashEquivalentsAtCarryingValue"],
  currentLongTermDebt: ["LongTermDebtCurrent"],
  noncurrentLongTermDebt: ["LongTermDebtNoncurrent"],
} as const;

function selectFact(
  gaap: Obj, tags: readonly string[], unit: "USD"|"shares",
  basis: SourcedFact["basis"], input: AnnualHistoricalBaselineInput,
): SourcedFact {
  const candidates: { tag:string; val:number; start:string|null }[] = [];
  for (const tag of tags) {
    const fact = obj(gaap[tag]) ? gaap[tag] as Obj : null;
    const units = fact && obj(fact.units) ? fact.units as Obj : null;
    const rows = units?.[unit];
    if (!Array.isArray(rows)) continue;
    for (const item of rows) {
      if (!obj(item) || !number(item.val) ||
          item.accn !== input.accession || item.filed !== input.filingDate ||
          item.form !== "10-K" || item.end !== input.fiscalEnd) continue;
      if (basis === "ANNUAL_DURATION") {
        if (item.start !== input.fiscalStart) continue;
        const days = (Date.parse(input.fiscalEnd + "T00:00:00Z") -
          Date.parse(input.fiscalStart + "T00:00:00Z")) / MS_DAY;
        if (days < 330 || days > 380) continue;
      } else if (item.start !== undefined && item.start !== null) continue;
      candidates.push({ tag, val:item.val, start:basis==="ANNUAL_DURATION"?input.fiscalStart:null });
    }
  }
  const identities = new Set(candidates.map(x => String(x.val)));
  const ambiguous = identities.size > 1;
  const first = candidates[0];
  return {
    status: ambiguous?"AMBIGUOUS":!first?"MISSING":"VERIFIED",
    amount: ambiguous||!first?null:first.val,
    tag: ambiguous||!first?null:first.tag, unit,
    start: basis==="ANNUAL_DURATION"?input.fiscalStart:null,
    end: input.fiscalEnd, accession: input.accession,
    filed: input.filingDate, basis,
  };
}
export function extractHistoricalCapitalBaseline(
  input: AnnualHistoricalBaselineInput, raw: unknown,
): AnnualHistoricalBaseline {
  if (!input || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol) ||
      !/^\d{10}$/.test(input.cik) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(input.accession) ||
      !date(input.filingDate) || !date(input.fiscalStart) || !date(input.fiscalEnd) ||
      input.fiscalStart >= input.fiscalEnd || input.fiscalEnd > input.filingDate ||
      !obj(raw) || Number(raw.cik) !== Number(input.cik) ||
      !obj(raw.facts) || !obj(raw.facts["us-gaap"]))
    throw new Error("AG_BASELINE_INVALID_SOURCE_OR_PERIOD");
  const gaap = raw.facts["us-gaap"] as Obj;
  const facts = {
    cashFromOperations: selectFact(gaap, tagSets.cashFromOperations, "USD", "ANNUAL_DURATION", input),
    capitalExpenditures: selectFact(gaap, tagSets.capitalExpenditures, "USD", "ANNUAL_DURATION", input),
    historicalDilutedWeightedAverageShares: selectFact(gaap, tagSets.historicalDilutedWeightedAverageShares,
      "shares", "ANNUAL_DURATION", input),
    cashAndCashEquivalents: selectFact(gaap, tagSets.cashAndCashEquivalents, "USD", "FISCAL_END_INSTANT", input),
    currentLongTermDebt: selectFact(gaap, tagSets.currentLongTermDebt, "USD", "FISCAL_END_INSTANT", input),
    noncurrentLongTermDebt: selectFact(gaap, tagSets.noncurrentLongTermDebt, "USD", "FISCAL_END_INSTANT", input),
  };
  const allVerified = Object.values(facts).every(f => f.status==="VERIFIED");
  const cfo = facts.cashFromOperations.amount, capex = facts.capitalExpenditures.amount;
  const cash = facts.cashAndCashEquivalents.amount;
  const debtCurrent = facts.currentLongTermDebt.amount;
  const debtNoncurrent = facts.noncurrentLongTermDebt.amount;
  // capex payments are recorded as nonnegative outflows under the SEC tag.
  const historicalLeveredFcfProxyUsd = cfo!==null && capex!==null && capex>=0
    ? cfo-capex : null;
  // This only counts TWO named categories of long-term debt, not all obligations.
  const narrowReportedNetDebtUsd = cash!==null && cash>=0 &&
    debtCurrent!==null && debtCurrent>=0 && debtNoncurrent!==null && debtNoncurrent>=0
    ? debtCurrent+debtNoncurrent-cash : null;
  return {
    version: AG_HISTORICAL_BASELINE_VERSION,
    symbol:input.symbol,cik:input.cik,accession:input.accession,
    filingDate:input.filingDate,fiscalStart:input.fiscalStart,
    fiscalEnd:input.fiscalEnd,
    secCompanyFactsUrl:`https://data.sec.gov/api/xbrl/companyfacts/CIK${input.cik}.json`,
    facts,historicalLeveredFcfProxyUsd,narrowReportedNetDebtUsd,
    status:allVerified && historicalLeveredFcfProxyUsd!==null &&
      narrowReportedNetDebtUsd!==null &&
      (facts.historicalDilutedWeightedAverageShares.amount??0)>0
      ? "COMPLETE_NARROW_BASELINE" : "INCOMPLETE_OR_AMBIGUOUS",
    eligibleAsUnleveredFcfForecast:false,
    eligibleAsTerminalShareForecast:false,
    readyForValuation:false,
    limitations:[
      "CFO less property, plant and equipment purchases is a historical levered cash-flow proxy, NOT projected unlevered cash flow.",
      "SEC weighted-average diluted shares for the fiscal year are NOT future diluted shares outstanding.",
      "Net debt counts current and noncurrent long-term debt less cash only; other short-term borrowing and noncash obligations require reconciliation.",
      "Exact 10-K accession is required; missing/conflicting facts remain null and cannot be filled from another period.",
      "Additional normalized FCF, balance sheet, growth and share-dilution assumptions require independent evidence before scenario valuation.",
    ],
  };
}
