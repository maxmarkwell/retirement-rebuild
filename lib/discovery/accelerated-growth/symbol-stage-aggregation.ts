import type {AgDeepStageResult} from "./catalyst-deep-stage-work";
import type {AgCommitteeDecision} from "./committee";

const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
export function aggregateAgDeepSymbolOutputs(input:{
 selectedSymbols:readonly string[];
 outputs:readonly {symbol:string;catalyst:AgDeepStageResult["catalysts"][number];deepResearch:AgDeepStageResult["results"][number]|null}[];
 quantitativeWatchResolutions:AgDeepStageResult["quantitativeWatchResolutions"];
 committeeWatchResolutions:AgDeepStageResult["committeeWatchResolutions"];
}):AgDeepStageResult{
 const selected=[...input.selectedSymbols];
 if(new Set(selected).size!==selected.length||selected.some(x=>!SYMBOL.test(x))) throw new Error("Invalid AG selected symbol manifest.");
 const bySymbol=new Map(input.outputs.map(x=>[x.symbol,x]));
 if(bySymbol.size!==input.outputs.length||selected.some(x=>!bySymbol.has(x))||input.outputs.some(x=>!selected.includes(x.symbol)))
  throw new Error("Incomplete AG deep symbol output manifest.");
 const ordered=selected.map(x=>bySymbol.get(x)!);
 for(const x of ordered) if(x.deepResearch&&x.deepResearch.symbol!==x.symbol) throw new Error("AG deep output identity mismatch.");
 return {selectedSymbols:selected,catalysts:ordered.map(x=>x.catalyst),
  results:ordered.flatMap(x=>x.deepResearch?[x.deepResearch]:[]),
  quantitativeWatchResolutions:structuredClone(input.quantitativeWatchResolutions),
  committeeWatchResolutions:structuredClone(input.committeeWatchResolutions),errors:[]};
}
export function aggregateAgCommitteeSymbolOutputs(input:{
 eligibleSymbols:readonly string[];decisions:readonly AgCommitteeDecision[];
}){
 const eligible=[...input.eligibleSymbols];
 if(new Set(eligible).size!==eligible.length||eligible.some(x=>!SYMBOL.test(x))) throw new Error("Invalid AG Committee symbol manifest.");
 const bySymbol=new Map(input.decisions.map(x=>[x.symbol,x]));
 if(bySymbol.size!==input.decisions.length||eligible.some(x=>!bySymbol.has(x))||input.decisions.some(x=>!eligible.includes(x.symbol)))
  throw new Error("Incomplete AG Committee symbol output manifest.");
 return {eligibleSymbols:eligible,decisions:eligible.map(x=>bySymbol.get(x)!),failedCount:0,errors:[]};
}