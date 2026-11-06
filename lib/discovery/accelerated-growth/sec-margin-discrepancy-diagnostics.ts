/**
 * Research-only SEC discrepancy inspector. Exact 10-K accession/date/annual
 * duration only. Alternative tagged concepts are EVIDENCE FOR HUMAN REVIEW,
 * never a substitute for the independently verified canonical metric.
 */
import type { SecMarginResult } from "./sec-two-year-margin";
export const AG_SEC_MARGIN_DIAGNOSTICS_VERSION="ag-sec-margin-diagnostics-v1";
type RecordValue=Record<string,unknown>;
const object=(x:unknown):x is RecordValue=>!!x&&typeof x==="object"&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==="number"&&Number.isFinite(x);
const date=(x:unknown):x is string=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 !Number.isNaN(Date.parse(x+"T00:00:00Z"));
const day=(s:string)=>Date.parse(s+"T00:00:00Z");
const allowedConcept=/operat|revenue|sales|income|underwrit|expense|profit|loss|earnedpremiums|premiumsearned/i;
const MAX_TAGS=30;
export type TaggedFact={
 namespace:string;tag:string;label:string;
 amountUsd:number;start:string;end:string;filed:string;accession:string;
};
export type YearDiagnostic={
 fiscalEnd:string;filedDate:string;accession:string|null;
 reviewReason:"CANONICAL_MATCH"|"CANONICAL_DIFFERENCE"|"CANONICAL_FACT_MISSING"|"SEC_TAG_AMBIGUOUS"|"ORIGINAL_FILING_UNVERIFIED";
 revenueDifferenceUsd:number|null;
 revenueToleranceUsd:number|null;
 operatingDifferenceUsd:number|null;
 operatingToleranceUsd:number|null;
 alternativeOriginalFilingFacts:TaggedFact[];
 alternativesTruncated:boolean;
};
export type MarginDiscrepancyDiagnostic={
 version:typeof AG_SEC_MARGIN_DIAGNOSTICS_VERSION;
 symbol:string;
 verificationVerdict:SecMarginResult["verdict"];
 years:YearDiagnostic[];
 includesPotentialAccountingDefinitions:boolean;
 alternativesAreVerification:false;
 altersPriorVerdict:false;
 executionEnabled:false;
 transactionsWritten:false;
 limitations:string[];
};
function difference(v:number|null,s:number|null){
 if(!finite(v)||!finite(s))return {delta:null,tolerance:null};
 return {
  delta:v-s,
  tolerance:Math.max(1_000_000,.005*Math.max(Math.abs(v),Math.abs(s))),
 };
}
function inventory(raw:unknown, accession:string, filed:string,end:string){
 const candidates:TaggedFact[]=[];
 if(!object(raw)||!object(raw.facts))return {facts:candidates,truncated:false};
 const namespaces=Object.entries(raw.facts)
  .filter((entry):entry is [string,RecordValue]=>object(entry[1]))
  .sort(([a],[b])=>a.localeCompare(b));
 for(const [namespace,space] of namespaces) {
  for(const [tag,entry] of Object.entries(space).sort(([a],[b])=>a.localeCompare(b))) {
   if(!object(entry))continue;
   const label=typeof entry.label==="string"?entry.label:"";
   if(!allowedConcept.test(tag+" "+label))continue;
   if(!object(entry.units)||!Array.isArray(entry.units.USD))continue;
   for(const row of entry.units.USD) {
    if(!object(row)||row.accn!==accession||row.form!=="10-K"||
       row.filed!==filed||row.end!==end||
       !date(row.start)||!finite(row.val))continue;
    const days=(day(end)-day(row.start))/86400000;
    if(days<330||days>380)continue;
    candidates.push({namespace,tag,label,amountUsd:row.val,
     start:row.start,end,filed,accession});
   }
  }
 }
 // Original-filing rows only. Dedup equivalent facts while keeping differing
 // values visible (a materially conflicting fact can never be hidden).
 const unique=new Map<string,TaggedFact>();
 for(const item of candidates)unique.set(
  [item.namespace,item.tag,item.start,item.amountUsd].join("|"),item);
 const sorted=[...unique.values()].sort((a,b)=>
  a.namespace.localeCompare(b.namespace)||a.tag.localeCompare(b.tag)||
  a.start.localeCompare(b.start)||a.amountUsd-b.amountUsd);
 return {facts:sorted.slice(0,MAX_TAGS),truncated:sorted.length>MAX_TAGS};
}
export function diagnoseSecMarginDiscrepancies(
 check:SecMarginResult,companyFactsRaw:unknown,
):MarginDiscrepancyDiagnostic {
 if(!check||!Array.isArray(check.years)||check.years.length!==2||
    !/^[A-Z][A-Z0-9.-]{0,14}$/.test(check.symbol))
  throw Error("AG_MARGIN_DIAGNOSTICS_INVALID_INPUT");
 const years:YearDiagnostic[]=check.years.map(y=>{
  const revenue=difference(y.vendorRevenueUsd,y.revenueUsdSec);
  const operating=difference(y.vendorOperatingIncomeUsd,y.operatingIncomeUsdSec);
  const problems=[y.revenueStatus,y.operatingStatus];
  const reason:YearDiagnostic["reviewReason"]=!y.accession?
   "ORIGINAL_FILING_UNVERIFIED":problems.includes("AMBIGUOUS")?
   "SEC_TAG_AMBIGUOUS":problems.includes("MISSING")?
   "CANONICAL_FACT_MISSING":problems.includes("MISMATCH")?
   "CANONICAL_DIFFERENCE":"CANONICAL_MATCH";
  const candidates=y.accession?
   inventory(companyFactsRaw,y.accession,y.filedDate,y.fiscalEnd):
   {facts:[],truncated:false};
  return {
   fiscalEnd:y.fiscalEnd,filedDate:y.filedDate,accession:y.accession,reviewReason:reason,
   revenueDifferenceUsd:revenue.delta,revenueToleranceUsd:revenue.tolerance,
   operatingDifferenceUsd:operating.delta,operatingToleranceUsd:operating.tolerance,
   alternativeOriginalFilingFacts:reason==="CANONICAL_MATCH"?[]:candidates.facts,
   alternativesTruncated:reason!=="CANONICAL_MATCH"&&candidates.truncated,
  };
 });
 return {
  version:AG_SEC_MARGIN_DIAGNOSTICS_VERSION,symbol:check.symbol,
  verificationVerdict:check.verdict,years,
  includesPotentialAccountingDefinitions:years.some(y=>y.alternativeOriginalFilingFacts.length>0),
  alternativesAreVerification:false,altersPriorVerdict:false,
  executionEnabled:false,transactionsWritten:false,
  limitations:[
   "This is an inspectable inventory of similarly named original-filing SEC USD duration facts, NOT accounting equivalence, a normalized earnings calculation, or proof that any concept is comparable.",
   "A vendor/SEC mismatch retains its prior NEEDS_REVIEW status. Neither an alternative tag nor small difference automatically overrides it.",
   "All alternatives must match the original 10-K accession, filing date and annual fiscal end. Non-USD, missing and inline statement-only facts may remain unavailable.",
   "An inventory with more than 30 unique tagged facts is truncated and explicitly flagged; a missing concept here does not prove its absence from the filing.",
   "Research-only diagnostics: no price, position sizing, Committee recommendation, portfolio write or order.",
  ],
 };
}
