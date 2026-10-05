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
export async function runAgCatalystDeepResearchStage(input:{
 discovery:AgDiscoveryHandoff;maxCandidates?:number;
}):Promise<AgDeepStageResult>{
 const plan=deriveAgPostDiscoveryPlan(input.discovery,input.maxCandidates);
 const catalysts:AgCatalystResearch[]=[],results:AgDeepResearch[]=[],errors:AgDeepStageResult["errors"]=[];
 for(const candidate of plan.selected){
  try{
   const catalyst=await researchAgCatalyst(candidate);catalysts.push(catalyst);
   if(catalyst.catalystStatus==="NOT_FOUND")continue;
   try{
    results.push(await researchAgDeepCandidate(candidate,catalyst,input.discovery.watchContext.research[candidate.symbol]??null));
   }catch(e){errors.push({symbol:candidate.symbol,stage:"DEEP_RESEARCH",error:e instanceof Error?e.message:"Unknown AG deep research error."});}
  }catch(e){errors.push({symbol:candidate.symbol,stage:"CATALYST",error:e instanceof Error?e.message:"Unknown AG catalyst error."});}
 }
 if(errors.length) throw new Error(`AG catalyst/deep research incomplete: ${errors.map(e=>e.symbol+":"+e.stage).join(",")}`);
 return {selectedSymbols:plan.selected.map(c=>c.symbol),catalysts,results,
  quantitativeWatchResolutions:plan.quantitativeWatchResolutions,
  committeeWatchResolutions:plan.committeeWatchResolutions,errors};
}
