/** Pure parser for watch operations frozen in the completed deep-research checkpoint. */
import type {AgWatchIntent} from "./watchlist-intent-capture";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
export function parseAgFrozenWatchIntents(input:{
 cycleId:string;payload:Record<string,unknown>;
}):readonly AgWatchIntent[]{
 if(!UUID.test(input.cycleId)||!input.payload||!Array.isArray(input.payload.watchlist_intents)||
    !Number.isSafeInteger(input.payload.watchlist_intent_count)||
    input.payload.watchlist_intent_count!==input.payload.watchlist_intents.length)
  throw new Error("Invalid frozen AG watch manifest");
 const intents=structuredClone(input.payload.watchlist_intents) as AgWatchIntent[];
 const seen=new Set<string>();
 for(const i of intents){
  if(!i||!["research_watch","committee_watch"].includes(i.stream)||!SYMBOL.test(i.symbol)||
     !["upsert_watch","resolve_research","resolve_quantitative","supersede_committee"].includes(i.action))
    throw new Error("Invalid frozen AG watch operation");
  const k=i.stream+":"+i.symbol;if(seen.has(k))throw new Error("Duplicate frozen AG watch operation");seen.add(k);
  if(i.action==="upsert_watch"){
   const o=i.outcome;
   if(i.stream!=="research_watch"||!o||o.symbol!==i.symbol||o.researchStatus!=="WATCH"||
      !Number.isFinite(o.confidence)||o.confidence<0||o.confidence>1||
      typeof o.thesis!=="string"||!o.thesis.trim()||typeof o.thesisClock!=="string"||!o.thesisClock.trim()||
      typeof o.model!=="string"||!o.model.trim()||typeof o.promptVersion!=="string"||!o.promptVersion.trim()||
      !Array.isArray(o.unresolvedQuestions)||!Array.isArray(o.invalidation)||
      o.priorWatchRowId!==i.source_row_id||o.priorWatchReassessed!==(i.source_row_id!==null)||
      (i.source_row_id!==null&&!UUID.test(i.source_row_id))) throw new Error("Invalid frozen AG watch payload");
  }else if(i.action==="resolve_research"){
   if(i.stream!=="research_watch"||!["PROCEED","STOP"].includes(i.resolution)||
      (i.source_row_id!==null&&!UUID.test(i.source_row_id))) throw new Error("Invalid frozen AG research resolution");
  }else{
   if(!UUID.test(i.source_row_id)||!["REVIEW","REJECT","INSUFFICIENT_DATA"].includes(i.resolution)||
      (i.action==="resolve_quantitative"&&i.stream!=="research_watch")||
      (i.action==="supersede_committee"&&i.stream!=="committee_watch"))
    throw new Error("Invalid frozen AG watch resolution");
  }
 }
 return intents;
}
