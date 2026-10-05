/** Pure contracts for durable research-stage handoffs. No database access. */
import type {AgDiscoveryCandidate,AgDiscoveryResult} from "./discovery";
import type {AgPriorResearchWatch} from "./deep-research";

const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type AgDiscoveryWatchContext={
 research:Record<string,AgPriorResearchWatch>;
 committee:Record<string,string>;
};
export type AgDiscoveryHandoff={
 discovery:AgDiscoveryResult;
 watchContext:AgDiscoveryWatchContext;
};
function validateMapKeys(map:Record<string,unknown>,label:string){
 for(const [k,v] of Object.entries(map)){
  if(!SYMBOL.test(k)) throw new Error(`Invalid AG ${label} ticker`);
  if(label==="Committee watch" && (typeof v!=="string"||!UUID.test(v))) throw new Error("Invalid AG Committee watch source");
 }
}
export function freezeAgDiscoveryHandoff(input:AgDiscoveryHandoff):AgDiscoveryHandoff{
 if(!input || input.discovery.rateLimited || input.discovery.stoppedEarly ||
    input.discovery.errors.length>0) throw new Error("Incomplete AG Discovery cannot be checkpointed");
 validateMapKeys(input.watchContext.research,"research watch");
 validateMapKeys(input.watchContext.committee,"Committee watch");
 for(const [ticker,w] of Object.entries(input.watchContext.research)){
  if(!w||!UUID.test(w.rowId)||!Number.isFinite(w.confidence)||
     !Array.isArray(w.unresolvedQuestions)||typeof w.thesis!=="string")
   throw new Error(`Invalid AG prior research watch: ${ticker}`);
 }
 const candidateSymbols=new Set<string>();
 for(const c of input.discovery.candidates as AgDiscoveryCandidate[]){
  if(!SYMBOL.test(c.symbol)||candidateSymbols.has(c.symbol)) throw new Error("Invalid or duplicate AG Discovery candidate");
  candidateSymbols.add(c.symbol);
 }
 return structuredClone(input);
}
