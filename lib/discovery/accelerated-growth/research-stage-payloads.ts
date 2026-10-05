import type {AgDiscoveryHandoff} from "./research-stage-handoff";
import type {AgDeepStageResult} from "./catalyst-deep-stage-work";
import {captureAgWatchlistIntent} from "./watchlist-intent-capture";

export function buildAgDiscoveryStagePayload(h:AgDiscoveryHandoff):Record<string,unknown>{
 return {discovery:h.discovery,watch_context:h.watchContext};
}
export function parseAgDiscoveryStagePayload(p:Record<string,unknown>):AgDiscoveryHandoff{
 if(!p||typeof p.discovery!=="object"||typeof p.watch_context!=="object") throw new Error("Invalid AG Discovery checkpoint payload");
 return structuredClone({discovery:p.discovery,watchContext:p.watch_context}) as AgDiscoveryHandoff;
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
 return structuredClone(p.deep_research_results) as AgDeepStageResult["results"];
}
