import "server-only";
import {authorizeAuthenticatedAgWorker,finishAgWorker} from "./autonomous-worker-auth";
import {enqueueAgResearchStep} from "./autonomous-queue";
export async function startAgAutonomousResearchContinuation(cycleId:string){
 if(process.env.AG_AUTONOMOUS_CYCLE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")return {started:false as const};
 const authorization=await authorizeAuthenticatedAgWorker(cycleId);
 try{
  const queued=await enqueueAgResearchStep({version:1,cycleId,token:authorization.token},{sequence:1});
  return {started:true as const,authorizationId:authorization.authorizationId,messageId:queued.messageId};
 }catch(error){
  try{await finishAgWorker(cycleId,authorization.token,"revoked");}catch{}
  throw error;
 }
}
