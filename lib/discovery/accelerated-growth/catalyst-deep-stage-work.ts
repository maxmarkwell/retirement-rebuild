import "server-only";
/** Catalyst/deep-research stage consuming only frozen Discovery handoff. */
import {researchAgCatalyst,type AgCatalystResearch} from "./catalyst-research";
import {researchAgDeepCandidate,type AgDeepResearch} from "./deep-research";
import type {AgDiscoveryHandoff} from "./research-stage-handoff";
import {deriveAgPostDiscoveryPlan} from "./post-discovery-plan";

export type AgDeepStageResult={
 selectedSymbols:string[];catalysts:AgCatalystResearch[];results:AgDeepResearch[];
 quantitativeWatchResolutions:ReturnType<typeof deriveAgPostDiscoveryPlan>["quantitativeWatchResolutions"];
 committeeWatchResolutions:ReturnType<typeof deriveAgPostDiscoveryPlan>["committeeWatchResolutions"];
 errors:Array<{symbol:string;stage:"CATALYST"|"DEEP_RESEARCH";error:string}>;
};
export async function runAgCatalystDeepSymbolWork(input:{candidate:AgDiscoveryHandoff["discovery"]["candidates"][number];discovery:AgDiscoveryHandoff}){
 const catalyst=await researchAgCatalyst(input.candidate);
 if(catalyst.catalystStatus==="NOT_FOUND") return {symbol:input.candidate.symbol,catalyst,deepResearch:null};
 const deepResearch=await researchAgDeepCandidate(input.candidate,catalyst,input.discovery.watchContext.research[input.candidate.symbol]??null);
 if(deepResearch.symbol!==input.candidate.symbol) throw new Error("AG deep-research symbol identity mismatch.");
 return {symbol:input.candidate.symbol,catalyst,deepResearch};
}

export async function runAgCatalystDeepResearchStage(input:{
 discovery:AgDiscoveryHandoff;maxCandidates?:number;
}):Promise<AgDeepStageResult>{
 const plan=deriveAgPostDiscoveryPlan(input.discovery,input.maxCandidates);
 const catalysts:AgCatalystResearch[]=[],results:AgDeepResearch[]=[],errors:AgDeepStageResult["errors"]=[];
 for(const candidate of plan.selected){
  try{ const unit=await runAgCatalystDeepSymbolWork({candidate,discovery:input.discovery}); catalysts.push(unit.catalyst); if(unit.deepResearch)results.push(unit.deepResearch); }catch(e){errors.push({symbol:candidate.symbol,stage:"DEEP_RESEARCH",error:e instanceof Error?e.message:"Unknown AG symbol research error."});}
 }
 if(errors.length) throw new Error(`AG catalyst/deep research incomplete: ${errors.map(e=>e.symbol+":"+e.stage).join(",")}`);
 return {selectedSymbols:plan.selected.map(c=>c.symbol),catalysts,results,
  quantitativeWatchResolutions:plan.quantitativeWatchResolutions,
  committeeWatchResolutions:plan.committeeWatchResolutions,errors};
}
