import "server-only";
import {
  inspectAgFinancialInflections,
  type AnnualCompanyEvidence,
  type InflectionReport,
} from "./financial-inflection-signals";

/**
 * Controlled evidence inspection of a user-supplied batch, not breadth
 * selection, SEC reconciliation or ranked investment recommendations.
 *
 * FMP historical annual rows are vendor evidence only. We collect FOUR
 * successive reported annual fiscal ends to infer THREE full-year starts
 * from their previous-year ends, not from guessed calendar-year starts.
 */
export const AG_LIVE_SIGNAL_BATCH_VERSION = "ag-live-signal-batch-v2";
export const FMP_INCOME_SOURCE = "https://financialmodelingprep.com/stable/income-statement";
export const FMP_CASH_SOURCE = "https://financialmodelingprep.com/stable/cash-flow-statement";
type Row = Record<string, unknown>;
const record = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+"T00:00:00Z"));
const finite = (v: unknown): v is number => typeof v==="number" && Number.isFinite(v);
const dayMs=86400000;
const filingDate=(r:Row) => r.filingDate ?? r.fillingDate;
const validSymbol = (s:string) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);
const symbolOf = (x:unknown) => typeof x==="string" ? x.trim().toUpperCase() : "";
const iso=(v:unknown):v is string=>typeof v==="string"&&!Number.isNaN(Date.parse(v));
export type LiveBatchRow = {
  symbol:string;
  result:"SIGNALS_PRESENT"|"NO_MECHANICAL_SIGNAL"|"EVIDENCE_GAP";
  evidenceFailureCode:string|null;
  report:InflectionReport|null;
  fiscalEnds:string[];
  missing:string[];
  sourceKind:"FMP_VENDOR_ONLY";
  issuerVerified:false;
  secFactsReconciled:false;
  valueAtPriceCalculated:false;
};
export type LiveSignalBatch = {
  version:typeof AG_LIVE_SIGNAL_BATCH_VERSION;
  asOf:string;
  capturedAt:string;
  selectionMode:"EXPLICIT_USER_SUPPLIED_SYMBOLS";
  symbolsRequested:number;
  symbolsAnalyzed:number;
  symbolsWithSignals:number;
  evidenceGaps:number;
  totalSignals:number;
  rows:LiveBatchRow[];
  independentIssuerVerificationPerformed:false;
  economicRankingPerformed:false;
  committeeDecisionsIssued:0;
  executionEnabled:false;
  transactionsWritten:false;
  limitations:string[];
};
function validAnnualRows(symbol:string, raw:unknown, asOf:string):Row[] {
  if (!Array.isArray(raw) || raw.length < 4 || raw.length > 8)
    throw Error("AG_BATCH_INSUFFICIENT_ANNUAL_ROWS");
  const rows:Row[]=[];
  for (const item of raw) {
    if (!record(item)) throw Error("AG_BATCH_BAD_ANNUAL_ROW");
    const dateValue=item.date, filed=filingDate(item);
    if (symbolOf(item.symbol)!==symbol || !date(dateValue) ||
        !date(filed) || dateValue>filed || filed>asOf ||
        (item.period!==undefined && item.period!=="FY"))
      throw Error("AG_BATCH_IDENTITY_OR_FILING_MISMATCH");
    rows.push(item);
  }
  const ordered=[...rows].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if (new Set(ordered.map(r=>r.date)).size!==ordered.length)
    throw Error("AG_BATCH_DUPLICATE_FISCAL_END");
  for (let i=0;i<3;i++) {
    const latest=ordered[i],previous=ordered[i+1];
    const delta=(Date.parse(String(latest.date)+"T00:00:00Z")-
      Date.parse(String(previous.date)+"T00:00:00Z"))/dayMs;
    if (delta<330 || delta>380 || String(previous[ "date" ]) >= String(latest["date"]))
      throw Error("AG_BATCH_FISCAL_YEAR_GAP");
  }
  return ordered.slice(0,4);
}
function numericOrNull(v:unknown):number|null {
  if (v===null || v===undefined) return null;
  if (!finite(v)) throw Error("AG_BATCH_INVALID_FINANCIAL_VALUE");
  return v;
}
function evidence(symbol:string, incomeRaw:unknown, cashRaw:unknown, asOf:string):AnnualCompanyEvidence[] {
  const income=validAnnualRows(symbol,incomeRaw,asOf);
  if (!Array.isArray(cashRaw) || cashRaw.length>8)
    throw Error("AG_BATCH_INVALID_CASH_ROWS");
  const cashMap=new Map<string,Row>();
  for (const r of cashRaw) {
    if (!record(r) || symbolOf(r.symbol)!==symbol || !date(r.date) ||
        !date(filingDate(r)) || String(filingDate(r))>asOf ||
        String(r.date)>String(filingDate(r)) ||
        (r.period!==undefined && r.period!=="FY") ||
        cashMap.has(r.date))
      throw Error("AG_BATCH_INCONSISTENT_CASH_SOURCE");
    cashMap.set(r.date,r);
  }
  const latestThree=income.slice(0,3).reverse();
  return latestThree.map((r,i)=>{
    const currentDate=String(r.date);
    const previousDate=String(income[3-i].date);
    const start=new Date(Date.parse(previousDate+"T00:00:00Z")+dayMs)
      .toISOString().slice(0,10);
    const cash=cashMap.get(currentDate);
    // A cash statement filed on a different date cannot silently be joined.
    const aligned=cash && filingDate(cash)===filingDate(r) ? cash:null;
    let capex:number|null=null;
    if (aligned) {
      const rawCapex=aligned.capitalExpenditure ?? aligned.capitalExpenditures;
      const value=numericOrNull(rawCapex);
      // FMP may use negative payment cash flow; normalize absolute outflow.
      capex=value===null?null:Math.abs(value);
    }
    return {
      symbol,fiscalStart:start,fiscalEnd:currentDate,filedDate:String(filingDate(r)),
      sourceRef:`FMP:annual-income:${symbol}:${currentDate}:${filingDate(r)};`+
        (aligned?`annual-cash:${symbol}:${currentDate}:${filingDate(aligned)}`:
        "cash-unverified-or-unaligned"),
      revenueUsd:numericOrNull(r.revenue),
      operatingIncomeUsd:numericOrNull(r.operatingIncome),
      netIncomeUsd:numericOrNull(r.netIncome),
      operatingCashFlowUsd:aligned?numericOrNull(aligned.operatingCashFlow):null,
      capitalExpendituresUsd:capex,
    };
  });
}
export function inspectLiveAnnualVendorBatch(
  symbols:string[], asOf:string, capturedAt:string,
  input:Record<string,{income:unknown;cash:unknown}|null>,
):LiveSignalBatch {
  if (!Array.isArray(symbols) || symbols.length<1 || symbols.length>6 ||
      !symbols.every(s=>typeof s==="string"&&validSymbol(s)) ||
      new Set(symbols).size!==symbols.length ||
      !date(asOf) || !iso(capturedAt) ||
      capturedAt.slice(0,10)!==asOf)
    throw Error("AG_BATCH_INVALID_SCOPE_OR_DATE");
  const rows:LiveBatchRow[]=symbols.map(symbol=>{
    const raw=input[symbol];
    if (!raw) return {
      symbol,result:"EVIDENCE_GAP",report:null,fiscalEnds:[],
      missing:["PROVIDER_DATA_UNAVAILABLE"],evidenceFailureCode:"PROVIDER_DATA_UNAVAILABLE",sourceKind:"FMP_VENDOR_ONLY",
      issuerVerified:false,secFactsReconciled:false,valueAtPriceCalculated:false,
    };
    try {
      const annual=evidence(symbol,raw.income,raw.cash,asOf);
      const report=inspectAgFinancialInflections(annual,asOf);
      return {
        symbol,result:report.signals.length?
          "SIGNALS_PRESENT" as const:"NO_MECHANICAL_SIGNAL" as const,
        report,fiscalEnds:report.fiscalEnds,missing:report.missing,
        evidenceFailureCode:null,
        sourceKind:"FMP_VENDOR_ONLY" as const,
        issuerVerified:false as const,secFactsReconciled:false as const,
        valueAtPriceCalculated:false as const,
      };
    } catch (error) {
      const code = error instanceof Error && /^AG_(?:BATCH|INFLECTION)_[A-Z0-9_]+$/.test(error.message)
        ? error.message : "AG_BATCH_UNKNOWN_FINANCIAL_EVIDENCE_ERROR";
      return {
        symbol,result:"EVIDENCE_GAP" as const,report:null,fiscalEnds:[],
        missing:[code],evidenceFailureCode:code,
        sourceKind:"FMP_VENDOR_ONLY" as const,
        issuerVerified:false as const,secFactsReconciled:false as const,
        valueAtPriceCalculated:false as const,
      };
    }
  });
  return {
    version:AG_LIVE_SIGNAL_BATCH_VERSION,asOf,capturedAt,
    selectionMode:"EXPLICIT_USER_SUPPLIED_SYMBOLS",
    symbolsRequested:symbols.length,
    symbolsAnalyzed:rows.filter(x=>x.report!==null).length,
    symbolsWithSignals:rows.filter(x=>x.result==="SIGNALS_PRESENT").length,
    evidenceGaps:rows.filter(x=>x.result==="EVIDENCE_GAP").length,
    totalSignals:rows.reduce((n,x)=>n+(x.report?.signals.length??0),0),
    rows,independentIssuerVerificationPerformed:false,economicRankingPerformed:false,
    committeeDecisionsIssued:0,executionEnabled:false,transactionsWritten:false,
    limitations:[
      "Input symbols are explicitly user-supplied from a prior snapshot; this does not select a representative or economically ranked universe.",
      "FMP-only annual company statements are vendor evidence, NOT SEC reconciled facts or independent issuer verification.",
      "The three annual duration starts are inferred from immediately prior fiscal ends, not directly verified with SEC filing period tags.",
      "Historical evidence can be missing, stale, restated or incomparable; all resulting signals are unverified research hypotheses.",
      "Machine-readable evidence failure codes report the specific validation stage but never prove eligibility or economic attractiveness.",
      "A pre-revenue company may have no margin or revenue growth calculation and still qualify through other independently verified AG thesis paths.",
      "Annual CFO-minus-capex is historical levered FCF proxy, never future unlevered FCF.",
      "No quote verification, valuation at price, independent research, Committee decision, trading, order sizing, or portfolio modifications are performed.",
    ],
  };
}

export async function fetchFmpVendorAnnualBundle(
  symbol:string,
):Promise<{income:unknown;cash:unknown}|null> {
  const key=process.env.FMP_API_KEY;
  if (!key) throw Error("AG_BATCH_PROVIDER_NOT_CONFIGURED");
  if (!validSymbol(symbol)) throw Error("AG_BATCH_INVALID_SYMBOL");
  const request=async(endpoint:string)=>{
    const url=new URL("https://financialmodelingprep.com/stable/"+endpoint);
    for(const [name,value] of Object.entries({
      symbol,period:"annual",limit:"4",apikey:key,
    })) url.searchParams.set(name,value);
    const response=await fetch(url,{
      cache:"no-store",signal:AbortSignal.timeout(15000),
      headers:{Accept:"application/json"},
    });
    if (!response.ok) throw Error("AG_BATCH_PROVIDER_REQUEST_FAILED");
    return response.json() as Promise<unknown>;
  };
  try {
    const [income,cash]=await Promise.all([
      request("income-statement"),request("cash-flow-statement"),
    ]);
    return {income,cash};
  } catch {return null;}
}
