/**
 * AG 2R research-only, source-dated post-merger CASH conversion bridge.
 * Payment reversals are sensitivity assumptions, NOT forecasts or company FCF.
 * Management's annual synergy target is not added to observed cash flow.
 */
export const AG_CASH_CONVERSION_VERSION="ag-post-merger-cash-conversion-v1";
export type QuarterlyEvidence={
 quarterEnd:string; cfoUsd:number; reportedFcfUsd:number;
 integrationCashPaymentsUsd:number; severanceCashPaymentsUsd:number;
 adjustedEbitdaUsd:number;
 sourceUrl:string;
};
export type CashConversionInput={
 symbol:string;asOf:string;quarterly:[QuarterlyEvidence,QuarterlyEvidence];
 sixMonthCfoUsd:number;sixMonthFcfUsd:number;
 nineMonthCfoUsd:number;nineMonthFcfUsd:number;
 nineMonthSbcUsd:number;nineMonthCapexContentSoftwareUsd:number;
 nineMonthIntegrationCashPaymentsUsd:number;
 nineMonthSeveranceCashPaymentsUsd:number;
 nineMonthEvidenceUrl:string;
 managementAnnualNetSynergyTargetUsd:number;
 synergySourceUrl:string;
};
const finite=(n:unknown):n is number=>typeof n==="number"&&Number.isFinite(n);
const date=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+"T00:00:00Z"));
const url=(v:unknown):v is string=>typeof v==="string"&&/^https:\/\//.test(v)&&v.length<500;
const near=(a:number,b:number)=>Math.abs(a-b)<=250000;
export type ConversionQuarter={
 quarterEnd:string; cfoUsd:number;reportedFcfUsd:number;
 cashInvestmentUsd:number;
 managementAdjustedEbitdaUsd:number;
 managementAdjustedEbitdaToReportedFcfGapUsd:number;
 disclosedMergerCashPaymentsUsd:number;
 sensitivity:{assumedNonrecurringFraction:number;hypotheticalFcfUsd:number}[];
};
export type CashConversionResult={
 version:typeof AG_CASH_CONVERSION_VERSION;symbol:string;asOf:string;
 quarters:ConversionQuarter[];
 nineMonth:{cfoUsd:number;reportedFcfUsd:number;capexContentSoftwareUsd:number;
  stockCompensationUsd:number;disclosedMergerCashPaymentsUsd:number;
  fcfAfterFullHypotheticalAddbackUsd:number};
 q2ToQ3ReportedFcfChangeUsd:number;
 q2ToQ3FullAddbackFcfChangeUsd:number;
 managementNetAnnualSynergyTargetUsd:number;
 synergyRealizedCashEvidence:"NOT_VERIFIED";
 normalizedAnnualOwnerFcfUsd:null;
 priceScenarioReady:false;
 result:"SOURCE_RECONCILED_CASH_BRIDGE_NOT_FORECAST";
 recommendation:null;executionEnabled:false;transactionsWritten:false;
 sources:string[];
 limitations:string[];
};
export function assessAgMergerCashConversion(input:CashConversionInput):CashConversionResult{
 if(!input||input.symbol!=="COUR"||!date(input.asOf)||
  !Array.isArray(input.quarterly)||input.quarterly.length!==2||
  input.quarterly[0].quarterEnd!=="2026-06-30"||
  input.quarterly[1].quarterEnd!=="2026-09-30"||
  !url(input.nineMonthEvidenceUrl)||!url(input.synergySourceUrl)||
  !finite(input.sixMonthCfoUsd)||!finite(input.sixMonthFcfUsd)||
  !finite(input.nineMonthCfoUsd)||!finite(input.nineMonthFcfUsd)||
  !finite(input.nineMonthSbcUsd)||input.nineMonthSbcUsd<0||
  !finite(input.nineMonthCapexContentSoftwareUsd)||input.nineMonthCapexContentSoftwareUsd<0||
  !finite(input.nineMonthIntegrationCashPaymentsUsd)||
  !finite(input.nineMonthSeveranceCashPaymentsUsd)||
  !finite(input.managementAnnualNetSynergyTargetUsd)||
  input.managementAnnualNetSynergyTargetUsd<0||
  !near(input.nineMonthCfoUsd-input.nineMonthCapexContentSoftwareUsd,input.nineMonthFcfUsd))
  throw Error("AG_CASH_CONVERSION_INVALID_YTD_INPUT");
 const qs:ConversionQuarter[]=input.quarterly.map(q=>{
  if(!date(q.quarterEnd)||q.quarterEnd>input.asOf||
   !url(q.sourceUrl)||![q.cfoUsd,q.reportedFcfUsd,q.integrationCashPaymentsUsd,
    q.severanceCashPaymentsUsd,q.adjustedEbitdaUsd].every(finite)||
   q.integrationCashPaymentsUsd<0||q.severanceCashPaymentsUsd<0||
   q.cfoUsd<q.reportedFcfUsd)
   throw Error("AG_CASH_CONVERSION_QUARTER_INVALID");
  const cashPayments=q.integrationCashPaymentsUsd+q.severanceCashPaymentsUsd;
  return {
   quarterEnd:q.quarterEnd,cfoUsd:q.cfoUsd,reportedFcfUsd:q.reportedFcfUsd,
   cashInvestmentUsd:q.cfoUsd-q.reportedFcfUsd,
   managementAdjustedEbitdaUsd:q.adjustedEbitdaUsd,
   managementAdjustedEbitdaToReportedFcfGapUsd:q.adjustedEbitdaUsd-q.reportedFcfUsd,
   disclosedMergerCashPaymentsUsd:cashPayments,
   sensitivity:[0,.5,1].map(f=>({
    assumedNonrecurringFraction:f,hypotheticalFcfUsd:q.reportedFcfUsd+f*cashPayments,
   })),
  };
 });
 const q2=qs[0],q3=qs[1];
 const ytdPayments=input.nineMonthIntegrationCashPaymentsUsd+
  input.nineMonthSeveranceCashPaymentsUsd;
 if(input.nineMonthIntegrationCashPaymentsUsd<0||
   input.nineMonthSeveranceCashPaymentsUsd<0||
   ytdPayments+250000<q2.disclosedMergerCashPaymentsUsd+q3.disclosedMergerCashPaymentsUsd||
   !near(q3.reportedFcfUsd,input.nineMonthFcfUsd-input.sixMonthFcfUsd)||
   !near(q3.cfoUsd,input.nineMonthCfoUsd-input.sixMonthCfoUsd))
  throw Error("AG_CASH_CONVERSION_PERIOD_RECONCILIATION_FAILED");
 return {
  version:AG_CASH_CONVERSION_VERSION,symbol:input.symbol,asOf:input.asOf,
  quarters:qs,
  nineMonth:{
   cfoUsd:input.nineMonthCfoUsd,reportedFcfUsd:input.nineMonthFcfUsd,
   capexContentSoftwareUsd:input.nineMonthCapexContentSoftwareUsd,
   stockCompensationUsd:input.nineMonthSbcUsd,
   disclosedMergerCashPaymentsUsd:ytdPayments,
   fcfAfterFullHypotheticalAddbackUsd:input.nineMonthFcfUsd+ytdPayments,
  },
  q2ToQ3ReportedFcfChangeUsd:q3.reportedFcfUsd-q2.reportedFcfUsd,
  q2ToQ3FullAddbackFcfChangeUsd:
   q3.sensitivity[2].hypotheticalFcfUsd-q2.sensitivity[2].hypotheticalFcfUsd,
  managementNetAnnualSynergyTargetUsd:input.managementAnnualNetSynergyTargetUsd,
  synergyRealizedCashEvidence:"NOT_VERIFIED",normalizedAnnualOwnerFcfUsd:null,
  priceScenarioReady:false,result:"SOURCE_RECONCILED_CASH_BRIDGE_NOT_FORECAST",
  recommendation:null,executionEnabled:false,transactionsWritten:false,
  sources:[...new Set([...input.quarterly.map(q=>q.sourceUrl),
   input.nineMonthEvidenceUrl,input.synergySourceUrl])],
  limitations:[
   "Cash-payment reversal is a hypothetical nonrecurrence sensitivity, not reported FCF, normalized recurring owner cash flow, or forecast.",
   "Managerially adjusted EBITDA is not cash flow; the model never substitutes EBITDA for FCF.",
   "Merger payment disclosures refer to cash OUTLAYS; expense charges, purchase accounting effects, future payments and synergies are separate concepts.",
   "The $115m annual NET synergy target is a MANAGEMENT target, not independently verified incremental FCF, and is never added to cash flow (avoids double counting).",
   "Q2/Q3 include differing combinations of pre- and post-merger operations; their standalone figures are not a full normalized combined-company run rate.",
   "Stock compensation, net working capital, integration spending recurrence, tax, liquidity obligations, share dilution and long-run reinvestment remain unresolved.",
   "CFO and 9m investment amounts are rounded; reconciliation tolerance is $0.25m for published rounded values.",
   "Source snapshot is dated and curated, not live SEC XBRL verification or a basis for BUY/WATCH/REJECT.",
  ],
 };
}
