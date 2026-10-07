import {handleCallback} from "@vercel/queue";
import {runAuthorizedAgDurabilityStep} from "@/lib/discovery/accelerated-growth/autonomous-worker-durability-step";
import {enqueueAgDurabilityStep,type AgResearchQueueMessage} from "@/lib/discovery/accelerated-growth/autonomous-queue";
import {finishAgWorker} from "@/lib/discovery/accelerated-growth/autonomous-worker-auth";
export const runtime="nodejs";
export const maxDuration=300;
function valid(message:unknown):message is AgResearchQueueMessage{
 if(!message||typeof message!=="object")return false;const m=message as Record<string,unknown>;
 return m.version===1&&typeof m.cycleId==="string"&&typeof m.token==="string"&&m.cycleId.length===36&&m.token.length>=32;
}
export const POST=handleCallback(async(message,metadata)=>{
 if(process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true"||process.env.AG_AUTONOMOUS_DURABILITY_ENABLED!=="true")return;
 if(!valid(message))throw new Error("Invalid AG autonomous durability message.");
 let result;
 try{ result=await runAuthorizedAgDurabilityStep({cycleId:message.cycleId,token:message.token}); }
 catch(error){
  if(metadata.deliveryCount>=3)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
  throw error;
 }
 if(result.outcome!=="continue")return;
 try{await enqueueAgDurabilityStep(message,{sequence:result.invocationNumber+1});}catch(error){
  if(metadata.deliveryCount>=3)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
  throw error;
 }
},{
 visibilityTimeoutSeconds:300,
 retry:(error,metadata)=>{
  if(metadata.deliveryCount>=3)return {acknowledge:true};
  return {afterSeconds:Math.min(300,2**metadata.deliveryCount*10)};
 },
});
