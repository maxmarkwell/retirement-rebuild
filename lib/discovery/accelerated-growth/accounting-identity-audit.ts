/**
 * AG 2P: original-10-K SEC concept identity and amendment audit.
 * A pretax-income vendor mapping match is a DIAGNOSTIC, never permission to
 * substitute one concept for operating income or promote a failed SEC gate.
 */
import type {SecMarginInput,SecMarginResult} from "./sec-two-year-margin";
export const AG_ACCOUNTING_IDENTITY_VERSION="ag-accounting-identity-v1";
type R=Record<string,unknown>;
const obj=(v:unknown):v is R=>!!v&&typeof v==="object"&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const dt=(v:unknown):v is string=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+"T00:00:00Z"));
const pretaxTags=[
 "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
 "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
] as const;
const interestTags=["InterestExpenseNonoperating","InterestExpenseNonOperating","InterestExpense"] as const;
const tolerance=(a:number,b:number)=>Math.max(1_000_000,.005*Math.max(Math.abs(a),Math.abs(b)));
const ms=86400000;
const dateValue=(s:string)=>Date.parse(s+"T00:00:00Z");
export type IdentityYear={
 fiscalEnd:string;
 accession:string|null;
 vendorOperatingIncomeUsd:number|null;
 originalSecOperatingIncomeUsd:number|null;
 originalSecPretaxIncomeUsd:number|null;
 originalSecInterestExpenseUsd:number|null;
 pretaxTag:string|null;
 vendorMatchesPretaxIncome:boolean;
 vendorMatchesCanonicalOperatingIncome:boolean;
 operatingMinusPretaxUsd:number|null;
 differenceMatchesReportedInterest:boolean|null;
 resolution:"VENDOR_ALIGNS_PRETAX_NOT_OPERATING"|"CANONICAL_MATCH"|
  "DIFFERENCE_UNEXPLAINED"|"MISSING_OR_CONFLICTING_SEC_CONCEPTS";
 amendmentFilings:{form:"10-K/A";filedDate:string;accession:string;primaryDocument:string}[];
 amendmentReviewRequired:boolean;
};
export type AccountingIdentityAudit={
 version:typeof AG_ACCOUNTING_IDENTITY_VERSION;
 symbol:string;
 verificationVerdict:SecMarginResult["verdict"];
 issuerVerified:boolean;
 years:IdentityYear[];
 anyPretaxMislabelEvidence:boolean;
 anyAmendmentReviewRequired:boolean;
 changesVerification:false;
 pricedEconomicsReady:false;
 executionEnabled:false;
 transactionsWritten:false;
 limitations:string[];
};
function exactFact(gaap:R,tags:readonly string[],accn:string,filed:string,end:string){
 const hits:{tag:string;value:number}[]=[];
 for(const tag of tags){
  const entry=gaap[tag];
  if(!obj(entry)||!obj(entry.units)||!Array.isArray(entry.units.USD))continue;
  for(const f of entry.units.USD){
   if(!obj(f)||f.accn!==accn||f.filed!==filed||f.form!=="10-K"||
      f.end!==end||!dt(f.start)||!finite(f.val))continue;
   const span=(dateValue(end)-dateValue(f.start))/ms;
   if(span>=330&&span<=380)hits.push({tag,value:f.val});
  }
 }
 if(!hits.length||new Set(hits.map(h=>h.value)).size!==1)
  return {tag:null,value:null};
 return hits[0];
}
function amendments(submissions:unknown,yearEnd:string,asOf:string){
 const recent=obj(submissions)&&obj(submissions.filings)&&obj(submissions.filings.recent)
  ?submissions.filings.recent:null;
 if(!recent)return [];
 const f=recent.form,a=recent.accessionNumber,d=recent.filingDate,
  rd=recent.reportDate,p=recent.primaryDocument;
 if(![f,a,d,rd,p].every(Array.isArray))return [];
 const output:IdentityYear["amendmentFilings"]=[];
 for(let i=0;i<(f as unknown[]).length;i++){
  const date=(d as unknown[])[i],acc=(a as unknown[])[i],doc=(p as unknown[])[i];
  if((f as unknown[])[i]!=="10-K/A"||(rd as unknown[])[i]!==yearEnd||
     !dt(date)||date>asOf||typeof acc!=="string"||
     !/^\d{10}-\d{2}-\d{6}$/.test(acc)||typeof doc!=="string"||
     !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(doc))continue;
  output.push({form:"10-K/A",filedDate:date,accession:acc,primaryDocument:doc});
 }
 return output.sort((x,y)=>x.filedDate.localeCompare(y.filedDate));
}
export function auditAgAccountingIdentity(
 input:SecMarginInput,check:SecMarginResult,
 companyFacts:unknown,submissions:unknown,
):AccountingIdentityAudit{
 if(!input||!check||check.symbol!==input.symbol||!Array.isArray(check.years)||
    check.years.length!==2||!obj(companyFacts)||!obj(companyFacts.facts)||
    !obj(companyFacts.facts["us-gaap"])||!dt(input.asOf)||
    !Array.isArray(input.years)||input.years.length!==2)
   throw Error("AG_ACCOUNTING_IDENTITY_INVALID_INPUT");
 const gaap=companyFacts.facts["us-gaap"] as R;
 const years:IdentityYear[]=check.years.map((y,i)=>{
  const vendor=input.years[i];
  if(vendor.fiscalEnd!==y.fiscalEnd||vendor.filedDate!==y.filedDate)
   throw Error("AG_ACCOUNTING_IDENTITY_PERIOD_MISMATCH");
  const pretax=y.accession?exactFact(gaap,pretaxTags,y.accession,y.filedDate,y.fiscalEnd):
    {tag:null,value:null};
  const interest=y.accession?exactFact(gaap,interestTags,y.accession,y.filedDate,y.fiscalEnd):
    {tag:null,value:null};
  const originalOp=y.operatingIncomeUsdSec;
  const vendorOp=y.vendorOperatingIncomeUsd;
  const matchesPretax=finite(vendorOp)&&finite(pretax.value)&&
    Math.abs(vendorOp-pretax.value)<=tolerance(vendorOp,pretax.value);
  const matchesOp=finite(vendorOp)&&finite(originalOp)&&
    Math.abs(vendorOp-originalOp)<=tolerance(vendorOp,originalOp);
  const difference=finite(originalOp)&&finite(pretax.value)?originalOp-pretax.value:null;
  const matchesInterest=difference===null||!finite(interest.value)?null:
    Math.abs(difference-interest.value)<=tolerance(difference,interest.value);
  const amendmentFilings=amendments(submissions,y.fiscalEnd,input.asOf);
  const resolution:IdentityYear["resolution"]=matchesOp&&y.operatingStatus==="MATCH"?
    "CANONICAL_MATCH":matchesPretax&&!matchesOp&&y.operatingStatus==="MISMATCH"?
    "VENDOR_ALIGNS_PRETAX_NOT_OPERATING":
    y.operatingStatus==="MISSING"||y.operatingStatus==="AMBIGUOUS"?
    "MISSING_OR_CONFLICTING_SEC_CONCEPTS":"DIFFERENCE_UNEXPLAINED";
  return {
   fiscalEnd:y.fiscalEnd,accession:y.accession,
   vendorOperatingIncomeUsd:vendorOp,originalSecOperatingIncomeUsd:originalOp,
   originalSecPretaxIncomeUsd:pretax.value,originalSecInterestExpenseUsd:interest.value,
   pretaxTag:pretax.tag,
   vendorMatchesPretaxIncome:matchesPretax,
   vendorMatchesCanonicalOperatingIncome:matchesOp,
   operatingMinusPretaxUsd:difference,differenceMatchesReportedInterest:matchesInterest,
   resolution,amendmentFilings,
   amendmentReviewRequired:amendmentFilings.length>0,
  };
 });
 return {
  version:AG_ACCOUNTING_IDENTITY_VERSION,symbol:input.symbol,
  verificationVerdict:check.verdict,issuerVerified:check.independentIssuerVerified,
  years,anyPretaxMislabelEvidence:years.some(y=>y.resolution==="VENDOR_ALIGNS_PRETAX_NOT_OPERATING"),
  anyAmendmentReviewRequired:years.some(y=>y.amendmentReviewRequired),
  changesVerification:false,pricedEconomicsReady:false,executionEnabled:false,
  transactionsWritten:false,
  limitations:[
   "Exact original 10-K annual SEC XBRL facts only; selected metric labels remain semantically distinct.",
   "Vendor alignment to pretax income is a possible vendor metric mapping error, NOT approval to relabel the vendor data or promote a failed verification result.",
   "Amendments are reported as metadata for manual inspection; no amended filing facts are substituted or assumed to restate income.",
   "A mismatch or missing SEC fact remains NEEDS_REVIEW. No valuation, forecast, current-price verification or investment recommendation.",
  ],
 };
}
