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
 if(plan.action==="manual_review" && plan.reason==="stale_or_failed" &&
    (plan.stage==="catalyst_deep_research"||plan.stage==="committee")){
  const row=rows.find(x=>x.stage===plan.stage);
  if(row?.status==="running" && row.leaseExpiresAt && Date.parse(row.leaseExpiresAt)<=Date.now()){
   await reclaimAuthenticatedAgExpiredSymbolParent(input.cycleId,plan.stage);
   const refreshed=await readAuthenticatedAgCheckpointStatus(input.cycleId);
   plan=planAgResume(refreshed);
  }
 }
 if(plan.action!=="wait" && plan.action!=="run") return {plan,executedStage:null,persistenceReady:false};
 if(plan.action==="wait"){
  // A successful reclaim intentionally creates a fresh live lease. Continue only
  // for the same symbol-fanout stage; all other live leases remain wait-only.
  if(plan.stage!=="catalyst_deep_research"&&plan.stage!=="committee")
   return {plan,executedStage:null,persistenceReady:false};
  plan={action:"run",stage:plan.stage};
 }
 if(plan.stage==="persistence"||plan.stage==="finalized")
  return {plan,executedStage:null,persistenceReady:plan.stage==="persistence"};

 const rpc=await createAuthenticatedAgStageCheckpointRpc();
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
