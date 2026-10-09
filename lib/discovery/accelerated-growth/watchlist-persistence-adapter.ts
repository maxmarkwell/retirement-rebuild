/** Isolated application adapter for the draft atomic watchlist RPC.
 * NOT connected to the active AG runner. All calls are derived from frozen
 * intent; ambiguous responses require read-only reconciliation before action.
 */
import type {AgWatchIntent} from "./watchlist-intent-capture";
import {
  prepareAgWatchPostconditionArgs,
  type AgWatchPostconditionArgs,
} from "./watchlist-reconciliation";

export type AgWatchRpcCall=AgWatchPostconditionArgs&{p_claim_token:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
const KEYS=[
 "p_cycle_id","p_claim_token","p_stream","p_ticker","p_action","p_source_row_id",
 "p_resolution","p_company_name","p_confidence","p_thesis","p_unresolved_questions",
 "p_thesis_clock","p_invalidation","p_model","p_prompt_version",
 "p_prior_watch_reassessed",
] as const;

export function prepareAgWatchRpcBatch(
 cycleId:string,claimToken:string,intents:readonly AgWatchIntent[],
):readonly AgWatchRpcCall[]{
 if(!UUID.test(cycleId)||!UUID.test(claimToken)||!Array.isArray(intents))
  throw new Error("Valid AG watch cycle and persistence claim required.");
 const seen=new Set<string>();
 return intents.map((intent)=>{
  const key=intent.stream+":"+intent.symbol;
  if(seen.has(key))throw new Error("Duplicate AG watch operation identity.");
  seen.add(key);
  return {...prepareAgWatchPostconditionArgs(cycleId,intent),p_claim_token:claimToken};
 });
}

function validCall(call:AgWatchRpcCall,cycle:string,claim:string):boolean{
 if(!call||!UUID.test(call.p_cycle_id)||call.p_cycle_id.toLowerCase()!==cycle||
    !UUID.test(call.p_claim_token)||call.p_claim_token.toLowerCase()!==claim||
    !SYMBOL.test(call.p_ticker)||
    !["research_watch","committee_watch"].includes(call.p_stream)||
    !["upsert_watch","resolve_research","resolve_quantitative","supersede_committee"].includes(call.p_action)||
    Object.keys(call).some((key)=>!KEYS.includes(key as typeof KEYS[number])))
  return false;
 if(call.p_action==="upsert_watch"){
  return call.p_stream==="research_watch"&&call.p_resolution===null&&
   (call.p_source_row_id===null||UUID.test(call.p_source_row_id))&&
   (call.p_company_name===null||typeof call.p_company_name==="string")&&
   typeof call.p_confidence==="number"&&Number.isFinite(call.p_confidence)&&
   call.p_confidence>=0&&call.p_confidence<=1&&
   typeof call.p_thesis==="string"&&typeof call.p_thesis_clock==="string"&&
   Array.isArray(call.p_unresolved_questions)&&
   call.p_unresolved_questions.every(x=>typeof x==="string")&&
   Array.isArray(call.p_invalidation)&&call.p_invalidation.every(x=>typeof x==="string")&&
   typeof call.p_model==="string"&&typeof call.p_prompt_version==="string"&&
   call.p_prior_watch_reassessed===(call.p_source_row_id!==null);
 }
 const emptyPayload=call.p_company_name===null&&call.p_confidence===null&&
  call.p_thesis===null&&call.p_unresolved_questions===null&&
  call.p_thesis_clock===null&&call.p_invalidation===null&&call.p_model===null&&
  call.p_prompt_version===null;
 if(!emptyPayload)return false;
 if(call.p_action==="resolve_research")
  return call.p_stream==="research_watch"&&
   ["PROCEED","STOP"].includes(call.p_resolution??"")&&
   (call.p_source_row_id===null||UUID.test(call.p_source_row_id))&&
   call.p_prior_watch_reassessed===(call.p_source_row_id!==null);
 if(call.p_action==="resolve_quantitative")
  return call.p_stream==="research_watch"&&UUID.test(call.p_source_row_id??"")&&
   ["REVIEW","REJECT","INSUFFICIENT_DATA"].includes(call.p_resolution??"")&&
   call.p_prior_watch_reassessed===false;
 return call.p_action==="supersede_committee"&&call.p_stream==="committee_watch"&&
  UUID.test(call.p_source_row_id??"")&&
  ["REVIEW","REJECT","INSUFFICIENT_DATA"].includes(call.p_resolution??"")&&
  call.p_prior_watch_reassessed===false;
}

export class AgAmbiguousWatchWriteError extends Error{
 constructor(
  readonly stream:AgWatchIntent["stream"],readonly ticker:string,
  readonly cause:unknown,
  readonly acknowledged:readonly {stream:AgWatchIntent["stream"];ticker:string;ledgerId:string}[]=[],
 ){
  super(`AG watch write outcome unknown for ${stream}:${ticker}; reconcile ledger and row postconditions before any retry.`);
  this.name="AgAmbiguousWatchWriteError";
 }
}

/** Prevalidates the whole batch before the first RPC. A thrown/invalid RPC
 * response is ambiguous because the database may already have committed.
 * There is deliberately no retry path here.
 */
export async function commitPreparedAgWatchBatch(
 calls:readonly AgWatchRpcCall[],
 invoke:(args:AgWatchRpcCall)=>Promise<string>,
):Promise<readonly string[]>{
 if(!Array.isArray(calls))throw new Error("Invalid prepared AG watch batch.");
 if(calls.length===0)return [];
 const cycle=calls[0].p_cycle_id.toLowerCase(),claim=calls[0].p_claim_token.toLowerCase();
 const seen=new Set<string>();
 for(const call of calls){
  if(!validCall(call,cycle,claim))throw new Error("Invalid prepared AG watch RPC arguments.");
  const key=call.p_stream+":"+call.p_ticker;
  if(seen.has(key))throw new Error("Duplicate prepared AG watch operation.");
  seen.add(key);
 }
 const ids:string[]=[],acknowledged:{stream:AgWatchIntent["stream"];ticker:string;ledgerId:string}[]=[];
 for(const call of calls){
  let id:string;
  try{id=await invoke(call);}
  catch(cause){throw new AgAmbiguousWatchWriteError(call.p_stream,call.p_ticker,cause,acknowledged);}
  if(!UUID.test(id))throw new AgAmbiguousWatchWriteError(
    call.p_stream,call.p_ticker,new Error("RPC returned an invalid watch ledger ID"),acknowledged);
  ids.push(id);acknowledged.push({stream:call.p_stream,ticker:call.p_ticker,ledgerId:id});
 }
 return ids;
}
