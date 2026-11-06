import "server-only";

/**
 * AG two-year vendor/SEC 10-K comparison. Research-only and fail-closed:
 * SEC filing identity, dates and same-filing US GAAP annual facts are required
 * separately for BOTH years. No reliance on a later filing's comparatives.
 */
export const AG_SEC_MARGIN_VERSION = "ag-sec-margin-two-year-v1";
const SEC_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_FACTS_URL = (cik:string) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
const SEC_SUBMISSIONS_URL = (cik:string) => `https://data.sec.gov/submissions/CIK${cik}.json`;
const revenueTags=[
 "RevenueFromContractWithCustomerExcludingAssessedTax","Revenues",
 "SalesRevenueNet","RevenueFromContractWithCustomerIncludingAssessedTax",
] as const;
const operatingTag="OperatingIncomeLoss";
type Obj=Record<string,unknown>;
const obj=(x:unknown):x is Obj=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const dt=(x:unknown):x is string=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"));
const norm=(x:unknown)=>typeof x==="string"?x.trim().toUpperCase():"";
const nameKey=(x:unknown)=>norm(x).replace(/\bCORPORATION\b/g,"CORP")
 .replace(/\bINCORPORATED\b/g,"INC").replace(/[^A-Z0-9]/g,"");
const MS_DAY=86400000;
const day=(s:string)=>Date.parse(s+"T00:00:00Z");
export type VendorAnnualMargin={
 symbol:string; fiscalEnd:string; filedDate:string;
 revenueUsd:number|null; operatingIncomeUsd:number|null;
};
export type SecMarginInput={
 symbol:string; vendorIssuerName:string;
 asOf:string; years:[VendorAnnualMargin,VendorAnnualMargin];
};
export type AnnualSecCheck={
 fiscalEnd:string; filedDate:string; accession:string|null;
 source10kUrl:string|null;
 revenueUsdSec:number|null;operatingIncomeUsdSec:number|null;
 vendorRevenueUsd:number|null;vendorOperatingIncomeUsd:number|null;
 secRevenueTag:string|null;secRevenueStart:string|null;secOperatingStart:string|null;
 revenueStatus:"MATCH"|"MISMATCH"|"MISSING"|"AMBIGUOUS";
 operatingStatus:"MATCH"|"MISMATCH"|"MISSING"|"AMBIGUOUS";
 secOperatingMarginPct:number|null;
 vendorOperatingMarginPct:number|null;
};
export type SecMarginResult={
 version:typeof AG_SEC_MARGIN_VERSION;
 symbol:string; cik:string|null;asOf:string;
 verdict:"VERIFIED_MARGIN_CHANGE"|"NEEDS_REVIEW";
 secMarginChangePp:number|null; vendorMarginChangePp:number|null;
 reportedVendorSignalConfirmed:boolean;
 years:AnnualSecCheck[];
 errors:string[];
 sourceUrls:string[];
 independentIssuerVerified:boolean;
 executionEnabled:false;transactionsWritten:false;
 economicRankingPerformed:false;recommendation:null;
 limitations:string[];
};
const blank=(v:VendorAnnualMargin):AnnualSecCheck=>({
 fiscalEnd:v.fiscalEnd,filedDate:v.filedDate,accession:null,source10kUrl:null,
 revenueUsdSec:null,operatingIncomeUsdSec:null,vendorRevenueUsd:v.revenueUsd,
 vendorOperatingIncomeUsd:v.operatingIncomeUsd,secRevenueTag:null,
 secRevenueStart:null,secOperatingStart:null,revenueStatus:"MISSING",
 operatingStatus:"MISSING",secOperatingMarginPct:null,
 vendorOperatingMarginPct:finite(v.revenueUsd)&&v.revenueUsd>0&&finite(v.operatingIncomeUsd)
 ? v.operatingIncomeUsd/v.revenueUsd*100:null,
});
function factsFor(gaap:Obj,tags:readonly string[],accn:string,filed:string,end:string){
 const matches:{tag:string;value:number;start:string}[]=[];
 for(const tag of tags){
  const entry=gaap[tag];
  if(!obj(entry)||!obj(entry.units)||!Array.isArray(entry.units.USD))continue;
  for(const row of entry.units.USD){
   if(!obj(row)||row.form!=="10-K"||row.accn!==accn||row.filed!==filed||
      row.end!==end||!dt(row.start)||!finite(row.val))continue;
   const days=(day(end)-day(row.start))/MS_DAY;
   if(days>=330&&days<=380)matches.push({tag,value:row.val,start:row.start});
  }
 }
 const distinct=new Set(matches.map(m=>m.start+"|"+m.value));
 return {ambiguous:distinct.size>1,found:matches[0]??null};
}
function compare(v:number|null,s:number|null,ambiguous:boolean){
 if(ambiguous)return "AMBIGUOUS" as const;
 if(v===null||s===null)return "MISSING" as const;
 const tol=Math.max(1_000_000,.005*Math.max(Math.abs(v),Math.abs(s)));
 return Math.abs(v-s)<=tol?"MATCH" as const:"MISMATCH" as const;
}
function filings(submissions:Obj,v:VendorAnnualMargin){
 const recent=obj(submissions.filings)&&obj(submissions.filings.recent)
  ?submissions.filings.recent:null;
 if(!recent) return null;
 const {form,accessionNumber,filingDate,reportDate,primaryDocument}=recent;
 if(![form,accessionNumber,filingDate,reportDate,primaryDocument].every(Array.isArray))return null;
 const indices=(form as unknown[]).map((f,i)=>f==="10-K"&&
  (filingDate as unknown[])[i]===v.filedDate&&
  (reportDate as unknown[])[i]===v.fiscalEnd?i:-1).filter(i=>i>=0);
 if(indices.length!==1)return null;
 const i=indices[0],acc=(accessionNumber as unknown[])[i],doc=(primaryDocument as unknown[])[i];
 if(typeof acc!=="string"||!/^\d{10}-\d{2}-\d{6}$/.test(acc)||
   typeof doc!=="string"||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(doc))return null;
 return {accession:acc,doc};
}
export function reconcileTwoYearSecMargins(
 input:SecMarginInput,tickerMap:unknown,submissionsRaw:unknown,companyFactsRaw:unknown,
):SecMarginResult {
 if(!input||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol)||
    !dt(input.asOf)||!Array.isArray(input.years)||input.years.length!==2||
    !Array.isArray(tickerMap)||!obj(submissionsRaw)||!obj(companyFactsRaw)||
    !obj(companyFactsRaw.facts)||!obj(companyFactsRaw.facts["us-gaap"]))
    throw Error("AG_SEC_MARGIN_INVALID_INPUT");
 const [previous,latest]=input.years;
 for(const v of input.years){
  if(v.symbol!==input.symbol||!dt(v.fiscalEnd)||!dt(v.filedDate)||
     v.fiscalEnd>v.filedDate||v.filedDate>input.asOf||
     !finite(v.revenueUsd)||v.revenueUsd<=0||
     !finite(v.operatingIncomeUsd))
    throw Error("AG_SEC_MARGIN_VENDOR_OR_DATE_INVALID");
 }
 const gap=(day(latest.fiscalEnd)-day(previous.fiscalEnd))/MS_DAY;
 if(gap<330||gap>380)throw Error("AG_SEC_MARGIN_NONCONSECUTIVE_FISCAL_YEARS");
 const result:SecMarginResult={
  version:AG_SEC_MARGIN_VERSION,symbol:input.symbol,cik:null,asOf:input.asOf,
  verdict:"NEEDS_REVIEW",secMarginChangePp:null,vendorMarginChangePp:
   latest.operatingIncomeUsd!/latest.revenueUsd!*100-
   previous.operatingIncomeUsd!/previous.revenueUsd!*100,
  reportedVendorSignalConfirmed:false,years:input.years.map(blank),
  errors:[],sourceUrls:[SEC_MAP_URL],independentIssuerVerified:false,
  executionEnabled:false,transactionsWritten:false,economicRankingPerformed:false,
  recommendation:null,limitations:[
   "Original 10-K annual USD facts only; SEC issuer ticker and filing metadata must match for BOTH years.",
   "Vendor revenue and operating income must each independently reconcile within max($1m, 0.5%).",
   "Missing SEC US GAAP revenue/operating income tags or non-10-K filers remain unresolved, never assumed zero.",
   "Margin improvement is a historical signal, NOT valuation, cash conversion, durable profitability, favorable investment economics or BUY.",
   "No portfolio or trading operations are permitted.",
  ],
 };
 const tickerMatches=tickerMap.filter(x=>obj(x)&&norm(x.ticker)===input.symbol);
 if(tickerMatches.length!==1){result.errors.push("SEC_TICKER_NOT_UNIQUE");return result;}
 const t=tickerMatches[0] as Obj;
 if(!Number.isInteger(t.cik_str)||Number(t.cik_str)<=0){result.errors.push("SEC_CIK_MISSING");return result;}
 const cik=String(t.cik_str).padStart(10,"0");
 result.cik=cik;
 result.sourceUrls.push(SEC_SUBMISSIONS_URL(cik),SEC_FACTS_URL(cik));
 const sec=submissionsRaw;
 if(Number(sec.cik)!==Number(t.cik_str)||Number(companyFactsRaw.cik)!==Number(t.cik_str)||
    !Array.isArray(sec.tickers)||!sec.tickers.some(x=>norm(x)===input.symbol)||
    nameKey(sec.name).length<5||nameKey(sec.name)!==nameKey(input.vendorIssuerName)||
    nameKey(t.title)!==nameKey(sec.name)){
  result.errors.push("SEC_ISSUER_IDENTITY_UNVERIFIED");return result;
 }
 result.independentIssuerVerified=true;
 const gaap=companyFactsRaw.facts["us-gaap"] as Obj;
 const cikNumber=Number(t.cik_str);
 for(let i=0;i<2;i++){
  const v=input.years[i],out=result.years[i],filing=filings(sec,v);
  if(!filing){result.errors.push("SEC_ORIGINAL_10K_UNVERIFIED_"+i);continue;}
  out.accession=filing.accession;
  out.source10kUrl=`https://www.sec.gov/Archives/edgar/data/${cikNumber}/${filing.accession.replace(/-/g,"")}/${filing.doc}`;
  const revenue=factsFor(gaap,revenueTags,filing.accession,v.filedDate,v.fiscalEnd);
  const op=factsFor(gaap,[operatingTag],filing.accession,v.filedDate,v.fiscalEnd);
  out.revenueStatus=compare(v.revenueUsd,revenue.found?.value??null,revenue.ambiguous);
  out.operatingStatus=compare(v.operatingIncomeUsd,op.found?.value??null,op.ambiguous);
  out.revenueUsdSec=!revenue.ambiguous?revenue.found?.value??null:null;
  out.operatingIncomeUsdSec=!op.ambiguous?op.found?.value??null:null;
  out.secRevenueTag=!revenue.ambiguous?revenue.found?.tag??null:null;
  out.secRevenueStart=!revenue.ambiguous?revenue.found?.start??null:null;
  out.secOperatingStart=!op.ambiguous?op.found?.start??null:null;
  if(out.revenueStatus==="MATCH"&&out.operatingStatus==="MATCH"&&
     out.revenueUsdSec!==null&&out.revenueUsdSec>0&&out.operatingIncomeUsdSec!==null)
   out.secOperatingMarginPct=out.operatingIncomeUsdSec/out.revenueUsdSec*100;
  else result.errors.push("FINANCIAL_MATERIALITY_OR_COVERAGE_UNVERIFIED_"+i);
 }
 if(result.years.every(y=>y.secOperatingMarginPct!==null)){
  result.secMarginChangePp=result.years[1].secOperatingMarginPct!-
   result.years[0].secOperatingMarginPct!;
  result.verdict="VERIFIED_MARGIN_CHANGE";
  result.reportedVendorSignalConfirmed=result.vendorMarginChangePp!==null&&
   result.vendorMarginChangePp>=3&&result.secMarginChangePp>=3;
 }
 return result;
}
async function secJson(url:string,userAgent:string){
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(17000),
  headers:{"User-Agent":userAgent,Accept:"application/json"}});
 if(!response.ok)throw Error("AG_SEC_MARGIN_SEC_PROVIDER_UNAVAILABLE");
 return response.json() as Promise<unknown>;
}
export async function fetchSecMarginSources(symbol:string){
 const ua=process.env.SEC_USER_AGENT;
 if(!ua||ua.trim().length<8)throw Error("AG_SEC_MARGIN_USER_AGENT_NOT_CONFIGURED");
 const mapping=await secJson(SEC_MAP_URL,ua);
 if(!obj(mapping))throw Error("AG_SEC_MARGIN_TICKER_MAP_INVALID");
 const entries=Object.values(mapping);
 const matches=entries.filter(x=>obj(x)&&norm(x.ticker)===symbol);
 if(matches.length!==1||!obj(matches[0])||!Number.isInteger(matches[0].cik_str))
  throw Error("AG_SEC_MARGIN_TICKER_NOT_UNIQUE");
 const cik=String(matches[0].cik_str).padStart(10,"0");
 const [submissions,facts]=await Promise.all([
  secJson(SEC_SUBMISSIONS_URL(cik),ua),secJson(SEC_FACTS_URL(cik),ua),
 ]);
 return {tickerMap:entries,submissions,facts};
}
