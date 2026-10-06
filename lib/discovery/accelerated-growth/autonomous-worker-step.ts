import "server-only";
import {claimAgWorker,finishAgWorker} from "./autonomous-worker-auth";
import {createWorkerAgExecutionContext} from "./autonomous-worker-context";
import {runNextAgResumableResearchStage} from "./resumable-daily-cycle-adapter";

export type AgWorkerStepResult={
 cycleId:string;outcome:"continue"|"needs_review";stage:string|null;action:string;
 invocationNumber:number;schedulingEnabled:false;transactionsWritten:false;
};
export async function runAuthorizedAgWorkerStep(input:{cycleId:string;token:string}):Promise<AgWorkerStepResult>{
 const claim=await claimAgWorker(input.cycleId,input.token);
 if(!claim)throw new Error("Worker authorization unavailable.");
 const context=createWorkerAgExecutionContext({cycleId:input.cycleId,userId:claim.userId,authorizationId:claim.authorizationId,token:input.token});
 try{
  const step=await runNextAgResumableResearchStage({cycleId:input.cycleId,maxCandidates:claim.maxCandidates,context});
  if(step.plan.action==="manual_review"){
   await finishAgWorker(input.cycleId,input.token,"revoked");
   return {cycleId:input.cycleId,outcome:"needs_review",stage:step.plan.stage,action:"manual_review",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false};
  }
  if(step.persistenceReady){
   return {cycleId:input.cycleId,outcome:"continue",stage:"persistence",action:"persistence_ready",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false};
  }
  const stage="stage" in step.plan?step.plan.stage:null;
  return {cycleId:input.cycleId,outcome:"continue",stage,action:step.plan.action==="wait"?"wait":step.plan.action==="complete"?"research_complete":"stage_step",invocationNumber:claim.invocationNumber,schedulingEnabled:false,transactionsWritten:false};
 }catch(error){
  try{await finishAgWorker(input.cycleId,input.token,"revoked");}catch{}
  throw error;
 }
}
