import "server-only";
import {claimAgWorker,finishAgWorker} from "./autonomous-worker-auth";
import {createWorkerAgExecutionContext} from "./autonomous-worker-context";
import {createWorkerAgDurabilityIo} from "./autonomous-worker-durability-context";
import {executeAgPersistenceStage} from "./persistence-stage-executor";

export type AgWorkerDurabilityResult={cycleId:string;outcome:"continue"|"completed"|"needs_review";stage:"persistence"|"finalized";action:string;invocationNumber:number;transactionsWritten:false};
export async function runAuthorizedAgDurabilityStep(input:{cycleId:string;token:string}):Promise<AgWorkerDurabilityResult>{
 const claim=await claimAgWorker(input.cycleId,input.token);
 if(!claim)throw new Error("Worker authorization unavailable.");
 const context=createWorkerAgExecutionContext({cycleId:input.cycleId,userId:claim.userId,authorizationId:claim.authorizationId,token:input.token});
 try{
  const checkpoints=await context.readCheckpointStatus(input.cycleId);
  const byStage=new Map(checkpoints.map(row=>[row.stage,row]));
  const research=["holding_review","discovery","catalyst_deep_research","committee"] as const;
  if(!research.every(stage=>byStage.get(stage)?.status==="completed")){
   await finishAgWorker(input.cycleId,input.token,"revoked");
   return {cycleId:input.cycleId,outcome:"needs_review",stage:"persistence",action:"research_incomplete",invocationNumber:claim.invocationNumber,transactionsWritten:false};
  }
  const persistence=byStage.get("persistence");
  const io=await createWorkerAgDurabilityIo({cycleId:input.cycleId,userId:claim.userId,authorizationId:claim.authorizationId,token:input.token});
  if(!persistence||persistence.status==="pending"){
   await executeAgPersistenceStage({cycleId:input.cycleId,io:io.persistence});
   return {cycleId:input.cycleId,outcome:"continue",stage:"finalized",action:"persistence_completed",invocationNumber:claim.invocationNumber,transactionsWritten:false};
  }
  if(persistence.status!=="completed"){
   await finishAgWorker(input.cycleId,input.token,"revoked");
   return {cycleId:input.cycleId,outcome:"needs_review",stage:"persistence",action:"persistence_reconcile_required",invocationNumber:claim.invocationNumber,transactionsWritten:false};
  }
  const finalized=byStage.get("finalized");
  if(finalized&&finalized.status!=="pending"){
   await finishAgWorker(input.cycleId,input.token,"revoked");
   return {cycleId:input.cycleId,outcome:"needs_review",stage:"finalized",action:"finalization_reconcile_required",invocationNumber:claim.invocationNumber,transactionsWritten:false};
  }
  const finalClaim=await io.finalization.claim(input.cycleId);
  if(!finalClaim.checkpointId||!finalClaim.claimToken)throw new Error("Invalid AG worker finalization claim.");
  if(!await io.finalization.finalize(finalClaim.checkpointId,finalClaim.claimToken))throw new Error("AG worker finalization rejected; reconcile authoritative state.");
  await finishAgWorker(input.cycleId,input.token,"consumed");
  return {cycleId:input.cycleId,outcome:"completed",stage:"finalized",action:"cycle_finalized",invocationNumber:claim.invocationNumber,transactionsWritten:false};
 }catch(error){
  try{await finishAgWorker(input.cycleId,input.token,"revoked");}catch{}
  throw error;
 }
}
