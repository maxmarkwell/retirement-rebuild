import "server-only";
/**
 * Non-activating adapter for the resumable AG research stages.
 *
 * This module intentionally stops before persistence. It gives the active
 * daily-cycle boundary one durable stage at a time without importing any
 * decision/watch write adapter or transaction executor.
 */
import {createAuthenticatedAgStageCheckpointRpc,reclaimAuthenticatedAgExpiredSymbolParent} from "./stage-checkpoint-supabase";
import {readAuthenticatedAgCheckpointStatus} from "./stage-checkpoint-status-reader";
import {planAgResume,type AgResumePlan} from "./resume-planner";
import {executeAgHoldingReviewStage} from "./resumable-stage-work";
import {
 executeAgDiscoveryStage,executeAgCatalystDeepStage,executeAgCommitteeResearchStage,
} from "./resumable-research-stages";

export type AgResearchResumeResult={
 plan:AgResumePlan;
 executedStage:"holding_review"|"discovery"|"catalyst_deep_research"|"committee"|null;
 persistenceReady:boolean;
};

export async function runNextAgResumableResearchStage(input:{
 cycleId:string;maxCandidates?:number;
}):Promise<AgResearchResumeResult>{
 const rows=await readAuthenticatedAgCheckpointStatus(input.cycleId);
 let plan=planAgResume(rows);
 let reclaimedSymbolParent=false;
 let reclaimedClaim:Awaited<ReturnType<typeof reclaimAuthenticatedAgExpiredSymbolParent>>|null=null;
 if(plan.action==="manual_review"){
  const reviewStage=plan.stage;
  if(plan.reason==="stale_or_failed" &&
     (reviewStage==="catalyst_deep_research"||reviewStage==="committee")){
   const row=rows.find(x=>x.stage===reviewStage);
   if(row?.status==="running" && row.leaseExpiresAt && Date.parse(row.leaseExpiresAt)<=Date.now()){
    reclaimedClaim=await reclaimAuthenticatedAgExpiredSymbolParent(input.cycleId,reviewStage);
   reclaimedSymbolParent=true;
   const refreshed=await readAuthenticatedAgCheckpointStatus(input.cycleId);
   plan=planAgResume(refreshed);
   }
  }
 }
 if(plan.action!=="wait" && plan.action!=="run") return {plan,executedStage:null,persistenceReady:false};
 if(plan.action==="wait"){
  // Narrow first so TypeScript and runtime both exclude the stage-less complete variant.
  const waitingStage=plan.stage;
  if(!reclaimedSymbolParent || (waitingStage!=="catalyst_deep_research"&&waitingStage!=="committee"))
   return {plan,executedStage:null,persistenceReady:false};
  plan={action:"run",stage:waitingStage};
 }
 // Persistence and finalization belong to the durability coordinator. Once
 // research reaches either boundary, signal the route to hand off rather than
 // silently returning a research stage_step.
 if(plan.stage==="persistence"||plan.stage==="finalized")
  return {plan,executedStage:null,persistenceReady:true};

 const baseRpc=await createAuthenticatedAgStageCheckpointRpc();
 const rpc=reclaimedClaim?{...baseRpc,claim:async(_cycleId:string,stage:any)=>stage===reclaimedClaim!.stage?reclaimedClaim!:baseRpc.claim(_cycleId,stage)}:baseRpc;
 switch(plan.stage){
  case "holding_review":
   await executeAgHoldingReviewStage({cycleId:input.cycleId,rpc});break;
  case "discovery":
   await executeAgDiscoveryStage({cycleId:input.cycleId,rpc});break;
  case "catalyst_deep_research":
   await executeAgCatalystDeepStage({cycleId:input.cycleId,rpc,maxCandidates:input.maxCandidates});break;
  case "committee":
   await executeAgCommitteeResearchStage({cycleId:input.cycleId,rpc});break;
 }
 return {plan,executedStage:plan.stage,persistenceReady:false};
}
