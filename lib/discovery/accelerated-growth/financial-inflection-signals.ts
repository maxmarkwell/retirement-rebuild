/**
 * Charter AG financial inflection diagnostics, v1.
 *
 * A cheap, explainable RESEARCH-ATTENTION pre-screen, not valuation or a
 * Committee recommendation. Never conflate historic fundamentals with a
 * priced investment thesis. Emerging/catalyst/dislocation require distinct
 * external and market evidence and are explicitly left UNASSESSED.
 */
export const AG_FINANCIAL_INFLECTION_VERSION = "ag-financial-inflection-v1";
export type AnnualCompanyEvidence = {
  symbol: string;
  fiscalStart: string;
  fiscalEnd: string;
  filedDate: string;
  sourceRef: string;
  revenueUsd: number | null;
  operatingIncomeUsd: number | null;
  netIncomeUsd: number | null;
  operatingCashFlowUsd: number | null;
  capitalExpendituresUsd: number | null;
};
export type InflectionSignal = {
  path: "accelerating_fundamentals" | "turnaround";
  mechanism: "REVENUE_ACCELERATION" | "OPERATING_MARGIN_EXPANSION" |
    "OPERATING_PROFIT_RECOVERY" | "CASH_FLOW_RECOVERY";
  periodEnd: string;
  observation: string;
  evidenceRefs: string[];
  status: "RESEARCH_HYPOTHESIS_ONLY";
};
export type InflectionReport = {
  version: typeof AG_FINANCIAL_INFLECTION_VERSION;
  asOf: string;
  symbol: string;
  fiscalEnds: string[];
  signals: InflectionSignal[];
  observations: {
    previousRevenueGrowth: number | null;
    latestRevenueGrowth: number | null;
    revenueGrowthAccelerationPp: number | null;
    previousOperatingMargin: number | null;
    latestOperatingMargin: number | null;
    operatingMarginChangePp: number | null;
    latestCashFlowProxyUsd: number | null;
    previousCashFlowProxyUsd: number | null;
  };
  missing: string[];
  pathReadiness: {
    accelerating_fundamentals: "POTENTIAL_SIGNAL" | "NO_SIGNAL_OR_INCOMPLETE";
    turnaround: "POTENTIAL_SIGNAL" | "NO_SIGNAL_OR_INCOMPLETE";
    emerging_opportunity: "REQUIRES_EXTERNAL_EVIDENCE";
    catalyst_driven: "REQUIRES_EXTERNAL_EVIDENCE";
    valuation_dislocation: "REQUIRES_PRICE_AND_VALUE";
  };
  economicRankingPerformed: false;
  recommendation: null;
  executionEnabled: false;
  limitations: string[];
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const dateOk = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const validRef = (x: unknown): x is string =>
  typeof x === "string" && x.trim().length >= 12 && x.length <= 2048;
const msPerDay = 86400000;
function dateValue(s:string) {return Date.parse(s + "T00:00:00Z");}
function growth(current:number|null,previous:number|null) {
  return finite(current) && finite(previous) && previous>0
    ? (current/previous-1) * 100 : null;
}
function margin(operating:number|null,revenue:number|null) {
  return finite(operating) && finite(revenue) && revenue>0
    ? operating/revenue*100 : null;
}
function cashProxy(r:AnnualCompanyEvidence) {
  return finite(r.operatingCashFlowUsd) &&
    finite(r.capitalExpendituresUsd) && r.capitalExpendituresUsd>=0
    ? r.operatingCashFlowUsd - r.capitalExpendituresUsd : null;
}
export function inspectAgFinancialInflections(
  annual: AnnualCompanyEvidence[],
  asOf: string,
): InflectionReport {
  if (!dateOk(asOf) || !Array.isArray(annual) || annual.length !== 3)
    throw new Error("AG_INFLECTION_SCOPE_INVALID");
  // Require the caller to explicitly provide ordered fiscal years rather
  // than silently sorting away a stale or mixed source.
  const symbols = new Set<string>();
  for (const r of annual) {
    if (!r || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(r.symbol) ||
        !dateOk(r.fiscalStart) || !dateOk(r.fiscalEnd) ||
        !dateOk(r.filedDate) || !validRef(r.sourceRef) ||
        r.fiscalStart >= r.fiscalEnd ||
        r.fiscalEnd > r.filedDate || r.filedDate > asOf)
      throw new Error("AG_INFLECTION_INVALID_PROVENANCE_OR_FUTURE_DATA");
    const days=(dateValue(r.fiscalEnd)-dateValue(r.fiscalStart))/msPerDay;
    if (days<330 || days>380) throw new Error("AG_INFLECTION_NONANNUAL_PERIOD");
    if ([r.revenueUsd,r.operatingIncomeUsd,r.netIncomeUsd,
      r.operatingCashFlowUsd,r.capitalExpendituresUsd].some(v=>v!==null && !finite(v)) ||
      (r.revenueUsd!==null && r.revenueUsd<=0) ||
      (r.capitalExpendituresUsd!==null && r.capitalExpendituresUsd<0))
      throw new Error("AG_INFLECTION_INVALID_FINANCIAL_VALUE");
    symbols.add(r.symbol);
  }
  if (symbols.size!==1) throw new Error("AG_INFLECTION_MIXED_ISSUERS");
  const [old,prev,latest]=annual;
  for (const [a,b] of [[old,prev],[prev,latest]]) {
    const gap=(dateValue(b.fiscalEnd)-dateValue(a.fiscalEnd))/msPerDay;
    if (gap<330 || gap>380 || dateValue(a.filedDate)>dateValue(b.fiscalEnd))
      throw new Error("AG_INFLECTION_INCONSISTENT_FISCAL_SEQUENCE");
  }
  const prevGrowth=growth(prev.revenueUsd,old.revenueUsd);
  const latestGrowth=growth(latest.revenueUsd,prev.revenueUsd);
  const acceleration=prevGrowth===null||latestGrowth===null?null:latestGrowth-prevGrowth;
  const prevMargin=margin(prev.operatingIncomeUsd,prev.revenueUsd);
  const latestMargin=margin(latest.operatingIncomeUsd,latest.revenueUsd);
  const marginChange=prevMargin===null||latestMargin===null?null:latestMargin-prevMargin;
  const latestFcf=cashProxy(latest),prevFcf=cashProxy(prev);
  const signals:InflectionSignal[]=[];
  const add=(path:InflectionSignal["path"],mechanism:InflectionSignal["mechanism"],
    observation:string, refs:AnnualCompanyEvidence[])=>signals.push({
      path,mechanism,observation,periodEnd:latest.fiscalEnd,
      evidenceRefs:refs.map(r=>r.sourceRef),status:"RESEARCH_HYPOTHESIS_ONLY",
    });
  // Material thresholds suppress reporting noise; not BUY thresholds or
  // blanket eligibility rules. Other opportunity paths remain open.
  if (acceleration!==null && latestGrowth!==null &&
      latestGrowth>0 && acceleration>=5)
    add("accelerating_fundamentals","REVENUE_ACCELERATION",
      "Latest annual revenue growth exceeds prior-year growth by at least 5 percentage points.",
      [old,prev,latest]);
  if (marginChange!==null && marginChange>=3)
    add("accelerating_fundamentals","OPERATING_MARGIN_EXPANSION",
      "Annual operating margin expanded by at least 3 percentage points.",
      [prev,latest]);
  if (finite(prev.operatingIncomeUsd) && finite(latest.operatingIncomeUsd) &&
      prev.operatingIncomeUsd<=0 && latest.operatingIncomeUsd>0)
    add("turnaround","OPERATING_PROFIT_RECOVERY",
      "Annual operating income moved from non-positive to positive.",
      [prev,latest]);
  if (prevFcf!==null && latestFcf!==null &&
      prevFcf<=0 && latestFcf>0)
    add("turnaround","CASH_FLOW_RECOVERY",
      "Annual CFO-minus-capex proxy moved from non-positive to positive.",
      [prev,latest]);
  const missing:string[]=[];
  if (acceleration===null) missing.push("THREE_YEAR_COMPARABLE_REVENUE");
  if (marginChange===null) missing.push("TWO_YEAR_COMPARABLE_OPERATING_MARGIN");
  if (prevFcf===null || latestFcf===null) missing.push("TWO_YEAR_OPERATING_CASH_FLOW_AND_CAPEX");
  const has=(path:InflectionSignal["path"])=>signals.some(x=>x.path===path);
  return {
    version:AG_FINANCIAL_INFLECTION_VERSION,asOf,symbol:latest.symbol,
    fiscalEnds:annual.map(x=>x.fiscalEnd),signals,
    observations:{
      previousRevenueGrowth:prevGrowth,latestRevenueGrowth:latestGrowth,
      revenueGrowthAccelerationPp:acceleration,previousOperatingMargin:prevMargin,
      latestOperatingMargin:latestMargin,operatingMarginChangePp:marginChange,
      latestCashFlowProxyUsd:latestFcf,previousCashFlowProxyUsd:prevFcf,
    },
    missing,
    pathReadiness:{
      accelerating_fundamentals:has("accelerating_fundamentals")
        ?"POTENTIAL_SIGNAL":"NO_SIGNAL_OR_INCOMPLETE",
      turnaround:has("turnaround")?"POTENTIAL_SIGNAL":"NO_SIGNAL_OR_INCOMPLETE",
      emerging_opportunity:"REQUIRES_EXTERNAL_EVIDENCE",
      catalyst_driven:"REQUIRES_EXTERNAL_EVIDENCE",
      valuation_dislocation:"REQUIRES_PRICE_AND_VALUE",
    },
    economicRankingPerformed:false,recommendation:null,executionEnabled:false,
    limitations:[
      "Historical FMP or SEC values must be independently checked for issuer, fiscal period, source and accounting comparability before decision-grade use.",
      "A mechanical historical change does not prove an inflection will persist or that today's stock price offers asymmetric returns.",
      "Annual CFO minus capital expenditures is a historical levered cash flow proxy, NOT future unlevered free cash flow.",
      "Material thresholds only identify hypotheses for research, not path qualifications, BUY/REJECT rules or quotas.",
      "Missing data remains missing. Turnaround and emerging/catalyst/dislocation paths must not be suppressed by revenue growth filters.",
      "This module does not search the market or fetch data; coverage must be audited independently.",
    ],
  };
}
