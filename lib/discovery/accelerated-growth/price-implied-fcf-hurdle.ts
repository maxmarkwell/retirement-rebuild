/**
 * Charter-aligned pure inverse-valuation diagnostic.
 * A cash-retention assumption is NOT net debt and is never implicitly
 * transferred to shareholders. This only solves a hypothetical FCF hurdle.
 */
export const AG_PRICE_HURDLE_VERSION="ag-price-hurdle-v1";
export type PriceHurdleInput={
 symbol:string;asOf:string;quoteUsd:number;quoteEvidenceRef:string;
 quoteDate:string;shareCount:number;sharesAsOf:string;
 sharesEvidenceRef:string;sharesBasis:string;
 balanceDate:string;balanceEvidenceRef:string;
 cashAndEquivalentsUsd:number;marketableSecuritiesUsd:number;
 totalLiabilitiesUsd:number;deferredRevenueUsd:number;
 historicalCashFromOperationsUsd:number;
 historicalSoftwareAndContentAndEquipmentPurchasesUsd:number;
 historicalStockCompensationUsd:number;
 cashFlowPeriod:string;
 normalizedFcfVerified:boolean;
 netDebtReconciled:boolean;
};
export type HurdleRow={
 availableCashFractionHypothesis:number;
 illustrativeCashCreditUsd:number;
 illustrativeResidualEquityValueUsd:number;
 fcfMultipleHypothesis:number;
 requiredAnnualSustainableFcfUsd:number;
};
export type PriceHurdleReport={
 version:typeof AG_PRICE_HURDLE_VERSION;
 symbol:string;asOf:string;
 marketCapitalizationUsd:number;
 liquidAssetsReportedUsd:number;
 liquidAssetsAsPercentOfMarketCap:number;
 reportedCashMinusTotalLiabilitiesUsd:number;
 historicalNineMonthLeveredCashProxyUsd:number;
 stockCompensationAsPercentOfNineMonthCfo:number|null;
 rows:HurdleRow[];
 priceSources:{quote:string;shares:string;balance:string};
 readiness:"RESEARCH_HURDLE_ONLY_NOT_SCENARIO_VALUATION";
 normalizedFcfVerified:false;
 adjustedNetDebtVerified:false;
 decision:"NOT_ASSESSED";
 economicRankingPerformed:false;
 executionEnabled:false;transactionsWritten:false;
 limitations:string[];
};
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const dated=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+"T00:00:00Z"));
const ref=(v:unknown):v is string=>typeof v==="string"&&v.startsWith("https://")&&v.length<500;
const flags=[0,.25,.5,.75] as const;
const multiples=[10,15] as const;
export function assessAgPriceImpliedFcfHurdle(input:PriceHurdleInput):PriceHurdleReport{
 if(!input||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol)||
  ![input.asOf,input.quoteDate,input.sharesAsOf,input.balanceDate].every(dated)||
  input.quoteDate>input.asOf||input.sharesAsOf>input.asOf||
  input.balanceDate>input.asOf||!ref(input.quoteEvidenceRef)||
  !ref(input.sharesEvidenceRef)||!ref(input.balanceEvidenceRef)||
  typeof input.sharesBasis!=="string"||input.sharesBasis.length<12||
  typeof input.cashFlowPeriod!=="string"||input.cashFlowPeriod.length<12||
  !finite(input.quoteUsd)||input.quoteUsd<=0||!finite(input.shareCount)||input.shareCount<=0||
  !finite(input.cashAndEquivalentsUsd)||input.cashAndEquivalentsUsd<0||
  !finite(input.marketableSecuritiesUsd)||input.marketableSecuritiesUsd<0||
  !finite(input.totalLiabilitiesUsd)||input.totalLiabilitiesUsd<0||
  !finite(input.deferredRevenueUsd)||input.deferredRevenueUsd<0||
  input.deferredRevenueUsd>input.totalLiabilitiesUsd||
  !finite(input.historicalCashFromOperationsUsd)||
  !finite(input.historicalSoftwareAndContentAndEquipmentPurchasesUsd)||
  input.historicalSoftwareAndContentAndEquipmentPurchasesUsd<0||
  !finite(input.historicalStockCompensationUsd)||input.historicalStockCompensationUsd<0||
  input.normalizedFcfVerified!==false||input.netDebtReconciled!==false)
  throw Error("AG_HURDLE_INVALID_OR_UNVERIFIED_SNAPSHOT");
 const marketCapitalizationUsd=input.quoteUsd*input.shareCount;
 const liquidAssetsReportedUsd=input.cashAndEquivalentsUsd+input.marketableSecuritiesUsd;
 if(!finite(marketCapitalizationUsd)||!finite(liquidAssetsReportedUsd))
  throw Error("AG_HURDLE_NUMBER_OVERFLOW");
 const rows:HurdleRow[]=[];
 for(const cashFraction of flags){
  for(const multiple of multiples){
   const credited=liquidAssetsReportedUsd*cashFraction;
   const residual=Math.max(0,marketCapitalizationUsd-credited);
   rows.push({
    availableCashFractionHypothesis:cashFraction,
    illustrativeCashCreditUsd:credited,
    illustrativeResidualEquityValueUsd:residual,
    fcfMultipleHypothesis:multiple,
    requiredAnnualSustainableFcfUsd:residual/multiple,
   });
  }
 }
 return {
  version:AG_PRICE_HURDLE_VERSION,symbol:input.symbol,asOf:input.asOf,
  marketCapitalizationUsd,liquidAssetsReportedUsd,
  liquidAssetsAsPercentOfMarketCap:liquidAssetsReportedUsd/marketCapitalizationUsd*100,
  reportedCashMinusTotalLiabilitiesUsd:liquidAssetsReportedUsd-input.totalLiabilitiesUsd,
  historicalNineMonthLeveredCashProxyUsd:input.historicalCashFromOperationsUsd-
   input.historicalSoftwareAndContentAndEquipmentPurchasesUsd,
  stockCompensationAsPercentOfNineMonthCfo:input.historicalCashFromOperationsUsd>0?
   input.historicalStockCompensationUsd/input.historicalCashFromOperationsUsd*100:null,
  rows,priceSources:{
   quote:input.quoteEvidenceRef,shares:input.sharesEvidenceRef,balance:input.balanceEvidenceRef,
  },
  readiness:"RESEARCH_HURDLE_ONLY_NOT_SCENARIO_VALUATION",
  normalizedFcfVerified:false,adjustedNetDebtVerified:false,
  decision:"NOT_ASSESSED",economicRankingPerformed:false,
  executionEnabled:false,transactionsWritten:false,
  limitations:[
   "Illustrative remaining equity value is market capitalization less an ASSUMED 0/25/50/75% cash credit; this is neither enterprise value nor debt-adjusted equity valuation.",
   "Total liabilities include deferred revenue and other operating obligations; total liabilities must never silently be treated as financial debt or all immediately due.",
   "Cash is required to fund operations, satisfy deferred-revenue services and obligations; 100% shareholder availability is not assumed.",
   "Required annual FCF is a reverse-engineered mathematical hurdle at 10x or 15x assumed multiples, NOT a forecast, discount rate, fair value or recommendation.",
   "Nine-month CFO less content purchases, software capitalization and equipment is a historical levered proxy; not annualized normalized unlevered FCF.",
   "Share count is dated and undiluted; market price is a separately dated closing quote; outstanding shares and dilution may change.",
   "Stock compensation is noncash in current CFO but economically dilutive; no automatic addition to owner earnings or prediction of future grants.",
   "Management merger synergies are targets, not verified cash realization; future cash flows, net debt, contingent obligations and fully diluted shares remain unverified.",
  ],
 };
}
