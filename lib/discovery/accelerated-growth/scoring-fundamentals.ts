import type { AcceleratedGrowthFundamentals } from "./types";

type FmpRatiosTtm={currentRatioTTM?:number};
type FmpKeyMetrics={returnOnInvestedCapitalTTM?:number;netDebtToEBITDATTM?:number;netDebtToEBITDA?:number};

async function fetchFmp<T>(path:string,symbol:string):Promise<T>{
 const apiKey=process.env.FMP_API_KEY;
 if(!apiKey)throw new Error("FMP_API_KEY is not configured.");
 const url=new URL(`https://financialmodelingprep.com/stable/${path}`);
 url.searchParams.set("symbol",symbol);url.searchParams.set("apikey",apiKey);
 const response=await fetch(url,{next:{revalidate:3600}});
 if(!response.ok){
  const text=await response.text();
  throw new Error(`FMP ${path} request failed with status ${response.status}: ${text.slice(0,250)}`);
 }
 return await response.json() as T;
}
function sum(values:Array<number|null>){
 const usable=values.filter((v):v is number=>v!=null&&Number.isFinite(v));
 return usable.length===values.length?usable.reduce((a,b)=>a+b,0):null;
}
function positiveRatio(n:number|null,d:number|null){
 return n!=null&&d!=null&&Number.isFinite(n)&&Number.isFinite(d)&&n>0&&d>0?n/d:null;
}
export type AgScoringFundamentals={
 returnOnInvestedCapital:number|null;freeCashFlow:number|null;netDebtToEbitda:number|null;currentRatio:number|null;
 freeCashFlowYield:number|null;priceToSalesRatio:number|null;priceToFreeCashFlowRatio:number|null;
};
export async function getAgScoringFundamentals(input:{symbol:string;marketCap:number;acceleration:AcceleratedGrowthFundamentals}):Promise<AgScoringFundamentals>{
 const symbol=input.symbol.trim().toUpperCase();
 const [ratiosRows,metricRows]=await Promise.all([
  fetchFmp<FmpRatiosTtm[]>("ratios-ttm",symbol),
  fetchFmp<FmpKeyMetrics[]>("key-metrics-ttm",symbol),
 ]);
 const ratios=ratiosRows?.[0]??null,metrics=metricRows?.[0]??null;
 const recent=input.acceleration.quarters.slice(0,4);
 const ttmRevenue=recent.length===4?sum(recent.map(q=>q.revenue)):null;
 const ttmFcf=recent.length===4?sum(recent.map(q=>q.freeCashFlow)):null;
 const marketCap=Number.isFinite(input.marketCap)&&input.marketCap>0?input.marketCap:null;
 return {
  returnOnInvestedCapital:metrics?.returnOnInvestedCapitalTTM!=null?metrics.returnOnInvestedCapitalTTM*100:null,
  freeCashFlow:ttmFcf,
  netDebtToEbitda:metrics?.netDebtToEBITDATTM??metrics?.netDebtToEBITDA??null,
  currentRatio:ratios?.currentRatioTTM??null,
  freeCashFlowYield:ttmFcf!=null&&marketCap!=null?(ttmFcf/marketCap)*100:null,
  priceToSalesRatio:positiveRatio(marketCap,ttmRevenue),
  priceToFreeCashFlowRatio:positiveRatio(marketCap,ttmFcf),
 };
}
