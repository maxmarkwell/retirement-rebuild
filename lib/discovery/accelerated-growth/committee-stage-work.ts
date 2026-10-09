import "server-only";
/** Committee stage consuming only completed deep-research evidence. */
import {runAgCommittee,type AgCommitteeDecision} from "./committee";
import type {AgDeepResearch} from "./deep-research";
export type AgCommitteeStageResult={eligibleSymbols:string[];decisions:AgCommitteeDecision[];failedCount:number;errors:Array<{symbol:string;error:string}>};
export async function runAgCommitteeSymbolWork(research:AgDeepResearch):Promise<AgCommitteeDecision>{
 if(research.researchStatus!=="PROCEED") throw new Error("AG Committee symbol work requires PROCEED.");
 const decision=await runAgCommittee(research);
 if(decision.symbol!==research.symbol) throw new Error("AG Committee symbol identity mismatch.");
 return decision;
}
export async function runAgCommitteeStage(research:readonly AgDeepResearch[]):Promise<AgCommitteeStageResult>{
 const eligible=research.filter(r=>r.researchStatus==="PROCEED");
 const decisions:AgCommitteeDecision[]=[],errors:AgCommitteeStageResult["errors"]=[];
 for(const r of eligible){
  try{decisions.push(await runAgCommitteeSymbolWork(r));}
  catch(e){errors.push({symbol:r.symbol,error:e instanceof Error?e.message:"Unknown AG Committee error."});}
 }
 if(errors.length) throw new Error(`AG Committee incomplete: ${errors.map(e=>e.symbol).join(",")}`);
 return {eligibleSymbols:eligible.map(r=>r.symbol),decisions,failedCount:0,errors};
}
