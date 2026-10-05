/** Pure, isolated capture of the two legacy AG watchlist mutation streams.
 * NO writes or active-runner imports. A complete upstream research result
 * must be validated by the stage executor before this function is called.
 * The plan is a frozen intent record, not proof of database application.
 */
export type AgWatchResearchOutcome = {
  symbol: string; companyName: string | null;
  researchStatus: "PROCEED" | "WATCH" | "STOP";
  confidence: number; thesis: string; unresolvedQuestions: string[];
  thesisClock: string; invalidation: string[];
  model: string; promptVersion: string; priorWatchReassessed: boolean;
  priorWatchRowId: string | null;
};
export type AgWatchResolution = {
  symbol: string; sourceWatchId: string; resolution: "REVIEW" | "REJECT" | "INSUFFICIENT_DATA";
};
export type AgWatchIntent =
  | { stream: "research_watch"; symbol: string; source_row_id: string | null; action: "upsert_watch";
      outcome: AgWatchResearchOutcome }
  | { stream: "research_watch"; symbol: string; source_row_id: string | null; action: "resolve_research";
      resolution: "PROCEED" | "STOP" }
  | { stream: "research_watch"; symbol: string; source_row_id: string; action: "resolve_quantitative";
      resolution: AgWatchResolution["resolution"] }
  | { stream: "committee_watch"; symbol: string; source_row_id: string; action: "supersede_committee";
      resolution: AgWatchResolution["resolution"] };
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function symbol(value: unknown): string {
  if (typeof value!=="string" || !SYMBOL.test(value)) {
    throw new Error("Invalid AG watch ticker identity");
  }
  return value;
}
function unique(values: readonly {symbol:string}[], label:string): void {
  const seen=new Set<string>();
  for(const value of values){
    const ticker=symbol(value?.symbol);
    if(seen.has(ticker)) throw new Error(`Duplicate ${label} ticker: ${ticker}`);
    seen.add(ticker);
  }
}
export function captureAgWatchlistIntent(input:{
  cycleId:string;
  outcomes:readonly AgWatchResearchOutcome[];
  quantitativeResolutions:readonly AgWatchResolution[];
  committeeResolutions:readonly {symbol:string;sourceDecisionId:string;resolution:AgWatchResolution["resolution"]}[];
  upstreamErrors:readonly unknown[];
  upstreamFailedCount:number;
  discoveryRateLimited:boolean;
  discoveryStoppedEarly:boolean;
}):{cycle_id:string;intent_count:number;intents:AgWatchIntent[]} {
  if(!UUID.test(input.cycleId) ||
     !Array.isArray(input.outcomes) ||
     !Array.isArray(input.quantitativeResolutions) ||
     !Array.isArray(input.committeeResolutions) ||
     !Array.isArray(input.upstreamErrors) ||
     input.upstreamErrors.length!==0 ||
     input.upstreamFailedCount!==0 ||
     input.discoveryRateLimited || input.discoveryStoppedEarly){
    throw new Error("Incomplete upstream AG research; watchlist intent cannot be frozen");
  }
  unique(input.outcomes,"research outcome");
  unique(input.quantitativeResolutions,"quantitative resolution");
  unique(input.committeeResolutions,"Committee resolution");
  const researchTickers=new Set(input.outcomes.map(x=>x.symbol));
  const quantitativeTickers=new Set(input.quantitativeResolutions.map(x=>x.symbol));
  for(const ticker of quantitativeTickers){
    if(researchTickers.has(ticker)){
      // The old sequential writer would allow a quantitative resolution to
      // overwrite a same-cycle research WATCH. Do not silently preserve that
      // ambiguous outcome in a new resumable protocol.
      throw new Error(`Conflicting research and quantitative watch intent: ${ticker}`);
    }
  }
  const intents:AgWatchIntent[]=[];
  for(const outcome of input.outcomes){
    if(!["PROCEED","WATCH","STOP"].includes(outcome.researchStatus) ||
       !Number.isFinite(outcome.confidence) || outcome.confidence<0 ||
       outcome.confidence>1 || typeof outcome.thesis!=="string" ||
       typeof outcome.thesisClock!=="string" ||
       !Array.isArray(outcome.unresolvedQuestions) ||
       !Array.isArray(outcome.invalidation) ||
       typeof outcome.model!=="string" ||
       typeof outcome.promptVersion!=="string" ||
       typeof outcome.priorWatchReassessed!=="boolean" ||
       (outcome.priorWatchRowId!==null && !UUID.test(outcome.priorWatchRowId)) ||
       (outcome.priorWatchReassessed !== (outcome.priorWatchRowId!==null)) ||
       (outcome.companyName!==null && typeof outcome.companyName!=="string")){
      throw new Error(`Invalid research watch outcome: ${outcome.symbol}`);
    }
    if(outcome.researchStatus==="WATCH"){
      intents.push({stream:"research_watch",symbol:outcome.symbol,
        source_row_id:outcome.priorWatchRowId,action:"upsert_watch",outcome:structuredClone(outcome)});
    }else{
      intents.push({stream:"research_watch",symbol:outcome.symbol,
        source_row_id:outcome.priorWatchRowId,action:"resolve_research",resolution:outcome.researchStatus});
    }
  }
  for(const item of input.quantitativeResolutions){
    if(!UUID.test(item.sourceWatchId) || !["REVIEW","REJECT","INSUFFICIENT_DATA"].includes(item.resolution))
      throw new Error(`Invalid quantitative resolution: ${item.symbol}`);
    intents.push({stream:"research_watch",symbol:item.symbol,
      source_row_id:item.sourceWatchId,action:"resolve_quantitative",resolution:item.resolution});
  }
  for(const item of input.committeeResolutions){
    if(!UUID.test(item.sourceDecisionId) || !["REVIEW","REJECT","INSUFFICIENT_DATA"].includes(item.resolution))
      throw new Error(`Invalid Committee watch resolution: ${item.symbol}`);
    intents.push({stream:"committee_watch",symbol:item.symbol,
      source_row_id:item.sourceDecisionId,action:"supersede_committee",resolution:item.resolution});
  }
  return {cycle_id:input.cycleId,intent_count:intents.length,intents};
}
