import "server-only";
import {validateAgWorker,chargeAgWorkerInvocation,finishAgWorker} from "./autonomous-worker-auth";
import {createWorkerAgExecutionContext} from "./autonomous-worker-context";
import {runNextAgResumableResearchStage} from "./resumable-daily-cycle-adapter";

export type AgWorkerStepResult={
 cycleId:string;outcome:"continue"|"needs_review";stage:string|null;action:string;
 invocationNumber:number;schedulingEnabled:false;transactionsWritten:false;
};
export async function runAuthorizedAgWorkerStep(input:{cycleId:string;token:string}):Promise<AgWorkerStepResult>{
 const authorization=await validateAgWorker(input.cycleId,input.token);
 if(!authorization)throw new Error("Worker authorization unavailable.");
 const context=createWorkerAgExecutionContext({cycleId:input.cycleId,userId:authorization.userId,authorizationId:authorization.authorizationId,token:input.token});
 try{
  const step=await runNextAgResumableResearchStage({cycleId:input.cycleId,maxCandidates:authorization.maxCandidates,context});
  if(step.plan.action==="manual_review"){
   await finishAgWorker(input.cycleId,input.token,"revoked");
   return {cycleId:input.cycleId,outcome:"needs_review",stage:step.plan.stage,action:"manual_review",invocationNumber:authorization.invocationNumber,schedulingEnabled:false,transactionsWritten:false};
  }
  // Passive resume checks are authorized but do not consume the bounded work
  // budget. Only an invocation that actually executed one research unit is charged.
  let invocationNumber=authorization.invocationNumber;
  if(step.executedStage){
   const charged=await chargeAgWorkerInvocation(input.cycleId,input.token);
   if(!charged)throw new Error("Worker productive invocation charge rejected.");
   invocationNumber=charged.invocationNumber;
  }
  if(step.persistenceReady){
   return {cycleId:input.cycleId,outcome:"continue",stage:"persistence",action:"persistence_ready",invocationNumber,schedulingEnabled:false,transactionsWritten:false};
  }
  const stage="stage" in step.plan?step.plan.stage:null;
  return {cycleId:input.cycleId,outcome:"continue",stage,action:step.plan.action==="wait"?"wait":step.plan.action==="complete"?"research_complete":"stage_step",invocationNumber,schedulingEnabled:false,transactionsWritten:false};
 }catch(error){
  try{
   const rows=await context.readCheckpointStatus(input.cycleId);
   const running=[...rows].reverse().find(row=>row.status==="running");
   const message=error instanceof Error?error.message:"Autonomous AG worker stage failed.";
   if(running&&context.markStageNeedsReview)await context.markStageNeedsReview(running.checkpointId,message);
  }catch{}
  try{await finishAgWorker(input.cycleId,input.token,"revoked");}catch{}
  throw error;
 }
}
