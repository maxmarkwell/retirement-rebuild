import {freezeAgDiscoveryHandoff,type AgDiscoveryHandoff} from "./research-stage-handoff";
import type {AgDeepStageResult} from "./catalyst-deep-stage-work";
import {captureAgWatchlistIntent} from "./watchlist-intent-capture";

export function buildAgDiscoveryStagePayload(h:AgDiscoveryHandoff):Record<string,unknown>{
 return {discovery:h.discovery,watch_context:h.watchContext};
}
export function parseAgDiscoveryStagePayload(p:Record<string,unknown>):AgDiscoveryHandoff{
 if(!p||typeof p.discovery!=="object"||p.discovery===null||
    typeof p.watch_context!=="object"||p.watch_context===null)
  throw new Error("Invalid AG Discovery checkpoint payload");
 return freezeAgDiscoveryHandoff(structuredClone({
  discovery:p.discovery,watchContext:p.watch_context,
 }) as AgDiscoveryHandoff);
}
export function buildAgCatalystDeepStagePayload(input:{cycleId:string;result:AgDeepStageResult}):Record<string,unknown>{
 const watch=captureAgWatchlistIntent({
  cycleId:input.cycleId,outcomes:input.result.results,
  quantitativeResolutions:input.result.quantitativeWatchResolutions,
  committeeResolutions:input.result.committeeWatchResolutions,
  upstreamErrors:input.result.errors,upstreamFailedCount:input.result.errors.length,
  discoveryRateLimited:false,discoveryStoppedEarly:false,
 });
 return {selected_symbols:input.result.selectedSymbols,catalysts:structuredClone(input.result.catalysts),
  deep_research_results:structuredClone(input.result.results),
  watchlist_intent_count:watch.intent_count,watchlist_intents:watch.intents};
}
export function parseAgDeepResearchResults(p:Record<string,unknown>):AgDeepStageResult["results"]{
 if(!Array.isArray(p.deep_research_results)) throw new Error("Missing AG deep research checkpoint results");
 const results=structuredClone(p.deep_research_results) as AgDeepStageResult["results"];
 const seen=new Set<string>();
 for(const r of results){
  if(!r||typeof r.symbol!=="string"||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(r.symbol)||
     seen.has(r.symbol)||!["PROCEED","WATCH","STOP"].includes(r.researchStatus)||
     !Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1||
     typeof r.thesis!=="string"||!r.thesis.trim()||
     typeof r.model!=="string"||!r.model.trim()||
     typeof r.promptVersion!=="string"||!r.promptVersion.trim())
   throw new Error("Invalid AG deep research checkpoint result");
  seen.add(r.symbol);
 }
 return results;
}
