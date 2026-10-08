import {handleCallback} from "@vercel/queue";
import {runAuthorizedAgWorkerStep} from "@/lib/discovery/accelerated-growth/autonomous-worker-step";
import {enqueueAgResearchStep,enqueueAgDurabilityStep,type AgResearchQueueMessage} from "@/lib/discovery/accelerated-growth/autonomous-queue";
import {finishAgWorker} from "@/lib/discovery/accelerated-growth/autonomous-worker-auth";
export const runtime="nodejs";
export const maxDuration=300;
function valid(message:unknown):message is AgResearchQueueMessage{
 if(!message||typeof message!=="object")return false;
 const m=message as Record<string,unknown>;
 const sequenceOk=m.wakeSequence===undefined||(Number.isInteger(m.wakeSequence)&&Number(m.wakeSequence)>=1&&Number(m.wakeSequence)<=10000);
 return m.version===1&&typeof m.cycleId==="string"&&typeof m.token==="string"&&m.cycleId.length===36&&m.token.length>=32&&sequenceOk;
}
export const POST=handleCallback(async(message,metadata)=>{
 if(process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")return;
 if(!valid(message))throw new Error("Invalid AG autonomous research message.");
 let result;
 try{ result=await runAuthorizedAgWorkerStep({cycleId:message.cycleId,token:message.token}); }
 catch(error){
  if(metadata.deliveryCount>=5)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
  throw error;
 }
 if(result.outcome==="needs_review")return;
 if(result.action==="persistence_ready"||result.action==="research_complete"){
  if(process.env.AG_AUTONOMOUS_DURABILITY_ENABLED!=="true"){
   // Do not acknowledge an unfinished six-stage cycle as successful.
   // Retries are bounded; terminal delivery revokes worker authorization so
   // the status reader exposes manual recovery instead of silent abandonment.
   if(metadata.deliveryCount>=5)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
   throw new Error("AG durability consumer disabled at research handoff; cycle requires reconciliation.");
  }
  try{await enqueueAgDurabilityStep(message,{sequence:1});}catch(error){
   if(metadata.deliveryCount>=5)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
   throw error;
  }
  return;
 }
 const afterSeconds=result.action==="wait"?30:0;
 const nextWakeSequence=(message.wakeSequence??1)+1;
 try{await enqueueAgResearchStep(message,{afterSeconds,sequence:nextWakeSequence});}catch(error){
  if(metadata.deliveryCount>=5)try{await finishAgWorker(message.cycleId,message.token,"revoked");}catch{}
  throw error;
 }
},{
 visibilityTimeoutSeconds:300,
 retry:(error,metadata)=>{
  if(metadata.deliveryCount>=5)return {acknowledge:true};
  return {afterSeconds:Math.min(300,2**metadata.deliveryCount*5)};
 },
});
