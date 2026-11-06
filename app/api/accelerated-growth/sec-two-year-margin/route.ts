import {NextRequest,NextResponse} from "next/server";
import {auditAgAccountingIdentity,type AccountingIdentityAudit} from "@/lib/discovery/accelerated-growth/accounting-identity-audit";
import { diagnoseSecMarginDiscrepancies, type MarginDiscrepancyDiagnostic } from "@/lib/discovery/accelerated-growth/sec-margin-discrepancy-diagnostics";
import {createClient} from "@/lib/supabase/server";
import {
 AG_SEC_MARGIN_VERSION,fetchSecMarginSources,reconcileTwoYearSecMargins,
 type SecMarginInput,type SecMarginResult,type VendorAnnualMargin,
} from "@/lib/discovery/accelerated-growth/sec-two-year-margin";
export const dynamic="force-dynamic";
export const maxDuration=90;
const headers={"Cache-Control":"no-store"};
const fail=(error:string,status:number)=>NextResponse.json({
 error,executionEnabled:false,transactionsWritten:false,
}, {status,headers});
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const date=(x:unknown):x is string=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"));
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const norm=(v:unknown)=>typeof v==="string"?v.trim().toUpperCase():"";
async function fmpRows(endpoint:string,symbol:string,limit?:number){
 const url=new URL("https://financialmodelingprep.com/stable/"+endpoint);
 url.searchParams.set("symbol",symbol);
 if(limit){url.searchParams.set("period","annual");url.searchParams.set("limit",String(limit));}
 url.searchParams.set("apikey",process.env.FMP_API_KEY!);
 const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(16000),
  headers:{Accept:"application/json"}});
 if(!response.ok)throw Error("AG_SEC_MARGIN_VENDOR_UNAVAILABLE");
 const raw:unknown=await response.json();
 if(!Array.isArray(raw)||!raw.every(obj)||raw.length===0)
  throw Error("AG_SEC_MARGIN_VENDOR_INVALID_RESPONSE");
 return raw;
}
async function vendorInput(symbol:string,asOf:string):Promise<SecMarginInput>{
 const [profileRows,statements]=await Promise.all([
  fmpRows("profile",symbol),fmpRows("income-statement",symbol,3),
 ]);
 const p=profileRows[0];
 if(norm(p.symbol)!==symbol||typeof p.companyName!=="string"||
    p.companyName.trim().length<5||statements.length<2)
  throw Error("AG_SEC_MARGIN_VENDOR_ISSUER_OR_PERIOD_INCOMPLETE");
 const rows:VendorAnnualMargin[]=statements.map(r=>{
  const filed=r.filingDate??r.fillingDate;
  if(norm(r.symbol)!==symbol||!date(r.date)||!date(filed)||
     filed>asOf||r.date>filed||(r.period!==undefined&&r.period!=="FY"))
   throw Error("AG_SEC_MARGIN_VENDOR_FILING_INVALID");
  if(!finite(r.revenue)||r.revenue<=0||!finite(r.operatingIncome))
   throw Error("AG_SEC_MARGIN_VENDOR_FINANCIALS_MISSING");
  return {symbol,fiscalEnd:r.date,filedDate:filed,
    revenueUsd:r.revenue,operatingIncomeUsd:r.operatingIncome};
 });
 rows.sort((a,b)=>b.fiscalEnd.localeCompare(a.fiscalEnd));
 if(rows[0].fiscalEnd===rows[1].fiscalEnd)
  throw Error("AG_SEC_MARGIN_DUPLICATE_PERIOD");
 return {symbol,vendorIssuerName:p.companyName.trim(),asOf,
  years:[rows[1],rows[0]]};
}
type ResultRow={
 symbol:string;status:"VERIFIED_MARGIN_CHANGE"|"NEEDS_REVIEW"|"EVIDENCE_GAP";
 check:SecMarginResult|null;diagnostic:MarginDiscrepancyDiagnostic|null;
 accountingIdentity:AccountingIdentityAudit|null;failureCode:string|null;
};
export async function POST(request:NextRequest){
 const db=await createClient();
 const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return fail("AUTH_REQUIRED",401);
 const origin=request.headers.get("origin");
 if(!origin||origin!==new URL(request.url).origin)return fail("AG_SEC_MARGIN_ORIGIN_INVALID",403);
 let body:unknown;
 try{body=await request.json();}catch{return fail("AG_SEC_MARGIN_INVALID_BODY",400);}
 if(!obj(body)||!Array.isArray(body.symbols)||body.symbols.length<1||
    body.symbols.length>3||body.symbols.some(s=>typeof s!=="string"||
    !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s))||
    new Set(body.symbols).size!==body.symbols.length||
    Object.keys(body).some(k=>k!=="symbols"))
  return fail("AG_SEC_MARGIN_INVALID_SCOPE",400);
 if(!process.env.FMP_API_KEY||!process.env.SEC_USER_AGENT)
  return fail("AG_SEC_MARGIN_PROVIDERS_NOT_CONFIGURED",503);
 const symbols=body.symbols as string[], capturedAt=new Date().toISOString();
 const asOf=capturedAt.slice(0,10);
 const rows:ResultRow[]=[];
 // Three explicit symbols maximum. No automated selection or broad scan.
 for(const symbol of symbols){
  try{
   const input=await vendorInput(symbol,asOf);
   const sources=await fetchSecMarginSources(symbol);
   const check=reconcileTwoYearSecMargins(input,
    sources.tickerMap,sources.submissions,sources.facts);
   rows.push({symbol,status:check.verdict,check,
    diagnostic:diagnoseSecMarginDiscrepancies(check,sources.facts),
    accountingIdentity:auditAgAccountingIdentity(input,check,sources.facts,sources.submissions),failureCode:null});
  }catch(error){
   const msg=error&&typeof error==="object"&&"message" in error?
    (error as {message:unknown}).message:null;
   const code=typeof msg==="string"&&/^AG_SEC_MARGIN_[A-Z0-9_]+$/.test(msg)
    ?msg:"AG_SEC_MARGIN_VALIDATION_UNAVAILABLE";
   rows.push({symbol,status:"EVIDENCE_GAP",check:null,diagnostic:null,accountingIdentity:null,failureCode:code});
  }
 }
 return NextResponse.json({
  version:AG_SEC_MARGIN_VERSION,asOf,capturedAt,
  selectionMode:"EXPLICIT_USER_SUPPLIED_SYMBOLS",
  requested:symbols.length,
  verified:rows.filter(x=>x.status==="VERIFIED_MARGIN_CHANGE").length,
  unresolved:rows.filter(x=>x.status!=="VERIFIED_MARGIN_CHANGE").length,
  rows,independentSecReconciliationAttempted:true,
  economicRankingPerformed:false,committeeDecisionsIssued:0,
  executionEnabled:false,transactionsWritten:false,persisted:false,
  limitations:[
   "Only requested US issuers with two original 10-K annual US GAAP comparisons; excluded formats remain unresolved.",
   "Vendor and SEC annual margin changes alone do not imply attractive stock returns.",
   "No price, cash flow, debt, dilution, scenario economics, investment recommendation or execution.",
  ],
 },{headers});
}
