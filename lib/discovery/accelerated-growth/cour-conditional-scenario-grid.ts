/**
 * AG 2S: conditional equity-value scenarios, NEVER a forecast or investment
 * committee output. Distinct from the decision-grade economics kernel: the
 * SEC-verified 2025 margin alone does not verify postmerger 2026 normalized FCF,
 * terminal net cash or fully diluted future shares. No synthetic MATCH claim.
 */
export const AG_CONDITIONAL_GRID_VERSION="ag-cour-conditional-grid-v1";
export type ScenarioId="adverse"|"base"|"favorable";
export type PriceScenario={
 id:ScenarioId;
 sustainableAnnualFcfUsdHypothesis:number;
 enterpriseToFcfMultipleHypothesis:number;
 terminalExcessNetCashUsdHypothesis:number;
 terminalDilutedSharesHypothesis:number;
 economicMechanism:string;
 evidenceGap:string;
 invalidationCondition:string;
};
export type ConditionalGridInput={
 symbol:"COUR";
 asOf:string;
 quoteDate:string;
 quoteUsd:number;
 quoteSourceUrl:string;
 filingDate:string;
 filingSourceUrl:string;
 currentBasicShares:number;
 currentLiquidAssetsUsd:number;
 currentDeferredRevenueUsd:number;
 currentReportedNineMonthFcfUsd:number;
 currentNineMonthStockCompensationUsd:number;
 managementSynergyTargetAnnualUsd:number;
 horizonYears:3;
 scenarios:[PriceScenario,PriceScenario,PriceScenario];
 sensitivityPricesUsd:[number,number,number];
};
export type GridOutcome={
 scenario:ScenarioId;
 terminalBusinessValueUsd:number;
 terminalEquityValueUsd:number;
 terminalPriceUsd:number;
 entryPriceUsd:number;
 totalReturnPct:number;
 annualizedReturnPct:number;
 potentialLossPct:number;
};
export type ConditionalScenarioReport={
 version:typeof AG_CONDITIONAL_GRID_VERSION;
 symbol:"COUR";asOf:string;quoteUsd:number;horizonYears:3;
 snapshot:{
  date:string;basicShares:number;liquidAssetsUsd:number;
  deferredRevenueUsd:number;nineMonthReportedFcfUsd:number;
  nineMonthStockCompUsd:number;managementSynergyTargetUsd:number;
 };
 scenarios:PriceScenario[];
 priceSensitivity:{entryPriceUsd:number;outcomes:GridOutcome[]}[];
 baselineOutcomes:GridOutcome[];
 priceFromVerifiedMarketClose:true;
 scenariosAreUnverifiedHypotheses:true;
 terminalNetCashIndependentlyReconciled:false;
 normalizedPostmergerFcfIndependentlyReconciled:false;
 terminalDilutionIndependentlyVerified:false;
 result:"CONDITIONAL_PRICE_SENSITIVITY_NOT_DECISION_GRADE";
 committeeDecision:null;recommendation:null;
 executionEnabled:false;transactionsWritten:false;persisted:false;
 sourceUrls:string[];
 limitations:string[];
};
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const date=(s:unknown):s is string=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+"T00:00:00Z"));
const url=(s:unknown):s is string=>typeof s==="string"&&
 s.startsWith("https://")&&s.length<500;
const meaningful=(s:unknown):s is string=>typeof s==="string"&&
 s.trim().length>=20&&s.trim().length<=1000;
const ordered:ScenarioId[]=["adverse","base","favorable"];
function outcome(s:PriceScenario,entryPriceUsd:number,horizonYears:number):GridOutcome {
 const terminalBusinessValueUsd=s.sustainableAnnualFcfUsdHypothesis*
  s.enterpriseToFcfMultipleHypothesis;
 const terminalEquityValueUsd=terminalBusinessValueUsd+s.terminalExcessNetCashUsdHypothesis;
 const terminalPriceUsd=terminalEquityValueUsd/s.terminalDilutedSharesHypothesis;
 const totalReturnPct=(terminalPriceUsd/entryPriceUsd-1)*100;
 const annualizedReturnPct=(Math.pow(terminalPriceUsd/entryPriceUsd,1/horizonYears)-1)*100;
 if(![terminalBusinessValueUsd,terminalEquityValueUsd,terminalPriceUsd,
   totalReturnPct,annualizedReturnPct].every(finite))
  throw Error("AG_GRID_OVERFLOW");
 return {
  scenario:s.id,terminalBusinessValueUsd,terminalEquityValueUsd,
  terminalPriceUsd,entryPriceUsd,totalReturnPct,annualizedReturnPct,
  potentialLossPct:Math.max(0,-totalReturnPct),
 };
}
export function assessAgConditionalScenarioGrid(input:ConditionalGridInput):ConditionalScenarioReport {
 if(!input||input.symbol!=="COUR"||!date(input.asOf)||
  !date(input.quoteDate)||!date(input.filingDate)||
  input.quoteDate>input.asOf||input.filingDate>input.asOf||
  !url(input.quoteSourceUrl)||!url(input.filingSourceUrl)||
  !finite(input.quoteUsd)||input.quoteUsd<=0||
  !finite(input.currentBasicShares)||input.currentBasicShares<=0||
  !finite(input.currentLiquidAssetsUsd)||input.currentLiquidAssetsUsd<0||
  !finite(input.currentDeferredRevenueUsd)||input.currentDeferredRevenueUsd<0||
  !finite(input.currentReportedNineMonthFcfUsd)||
  !finite(input.currentNineMonthStockCompensationUsd)||input.currentNineMonthStockCompensationUsd<0||
  !finite(input.managementSynergyTargetAnnualUsd)||input.managementSynergyTargetAnnualUsd<0||
  input.horizonYears!==3||!Array.isArray(input.scenarios)||input.scenarios.length!==3||
  !Array.isArray(input.sensitivityPricesUsd)||input.sensitivityPricesUsd.length!==3)
  throw Error("AG_GRID_INVALID_DATED_EVIDENCE");
 for(let i=0;i<3;i++){
  const s=input.scenarios[i];
  if(!s||s.id!==ordered[i]||
   !finite(s.sustainableAnnualFcfUsdHypothesis)||s.sustainableAnnualFcfUsdHypothesis<0||
   !finite(s.enterpriseToFcfMultipleHypothesis)||s.enterpriseToFcfMultipleHypothesis<=0||
   s.enterpriseToFcfMultipleHypothesis>50||
   !finite(s.terminalExcessNetCashUsdHypothesis)||s.terminalExcessNetCashUsdHypothesis<0||
   !finite(s.terminalDilutedSharesHypothesis)||s.terminalDilutedSharesHypothesis<=0||
   !meaningful(s.economicMechanism)||!meaningful(s.evidenceGap)||
   !meaningful(s.invalidationCondition))
   throw Error("AG_GRID_INVALID_HYPOTHESIS_"+i);
 }
 const p=input.sensitivityPricesUsd;
 if(!p.every(x=>finite(x)&&x>0)||!(p[0]<p[1]&&p[1]<p[2])||
  Math.abs(p[1]-input.quoteUsd)>1e-8)
  throw Error("AG_GRID_PRICE_SENSITIVITY_INVALID");
 const baseline=input.scenarios.map(s=>outcome(s,input.quoteUsd,input.horizonYears));
 if(!(baseline[0].terminalPriceUsd<baseline[1].terminalPriceUsd&&
   baseline[1].terminalPriceUsd<baseline[2].terminalPriceUsd))
  throw Error("AG_GRID_SCENARIO_ORDER_INVALID");
 return {
  version:AG_CONDITIONAL_GRID_VERSION,symbol:"COUR",asOf:input.asOf,
  quoteUsd:input.quoteUsd,horizonYears:3,
  snapshot:{
   date:input.filingDate,basicShares:input.currentBasicShares,
   liquidAssetsUsd:input.currentLiquidAssetsUsd,
   deferredRevenueUsd:input.currentDeferredRevenueUsd,
   nineMonthReportedFcfUsd:input.currentReportedNineMonthFcfUsd,
   nineMonthStockCompUsd:input.currentNineMonthStockCompensationUsd,
   managementSynergyTargetUsd:input.managementSynergyTargetAnnualUsd,
  },
  scenarios:input.scenarios,
  priceSensitivity:p.map(entryPriceUsd=>({
   entryPriceUsd,
   outcomes:input.scenarios.map(s=>outcome(s,entryPriceUsd,input.horizonYears)),
  })),
  baselineOutcomes:baseline,
  priceFromVerifiedMarketClose:true,
  scenariosAreUnverifiedHypotheses:true,
  terminalNetCashIndependentlyReconciled:false,
  normalizedPostmergerFcfIndependentlyReconciled:false,
  terminalDilutionIndependentlyVerified:false,
  result:"CONDITIONAL_PRICE_SENSITIVITY_NOT_DECISION_GRADE",
  committeeDecision:null,recommendation:null,
  executionEnabled:false,transactionsWritten:false,persisted:false,
  sourceUrls:[input.filingSourceUrl,input.quoteSourceUrl],
  limitations:[
   "All three future operating FCF, terminal FCF multiples, terminal excess-net-cash and diluted share inputs are explicitly UNVERIFIED analyst stress assumptions, NOT forecasts or facts.",
   "Terminal enterprise value proxy = assumed sustainable annual UNLEVERED FCF × assumed terminal EV/FCF multiple; then add ASSUMED excess terminal net cash. Whether any actual cash remains excess is not independently verified.",
   "Negative sustainable FCF, insolvency and financing-event valuation need a separate model; adverse scenario may materially underestimate the risk of a total loss.",
   "Reported $775.5m liquidity is NOT counted entirely as excess; deferred revenue and content delivery requirements, strategic investment, buybacks and future obligations limit cash availability.",
   "Three-year terminal sensitivity ignores interim operating cash flows, distributions, repurchases, tax, financing and the time value of terminal cash; not a complete present-value DCF.",
   "Management $115m annual net synergy TARGET is NOT included as verified incremental owner cash flow; no double-counting of the $96m disclosed merger cash payments.",
   "Current 253.3m basic common shares are NOT terminal diluted shares, and stock-based compensation creates ongoing economic dilution.",
   "A favorable or near-fair implied price is not a Committee BUY; independently validate forward cash conversion, actual excess net cash and fully diluted terminal share count first.",
  ],
 };
}
