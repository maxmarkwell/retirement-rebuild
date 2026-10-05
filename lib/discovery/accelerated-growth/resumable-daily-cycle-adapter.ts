import "server-only";
/**
 * Non-activating adapter for the resumable AG research stages.
 *
 * This module intentionally stops before persistence. It gives the active
 * daily-cycle boundary one durable stage at a time without importing any
 * decision/watch write adapter or transaction executor.
 */
import {createAuthenticatedAgStageCheckpointRpc} from "./stage-checkpoint-supabase";
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
 const plan=planAgResume(rows);
 if(plan.action!=="run") return {plan,executedStage:null,persistenceReady:plan.action==="run"&&plan.stage==="persistence"};
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
