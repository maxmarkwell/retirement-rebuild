import {handleCallback} from "@vercel/queue";
import {runAuthorizedAgWorkerStep} from "@/lib/discovery/accelerated-growth/autonomous-worker-step";
import {enqueueAgResearchStep,type AgResearchQueueMessage} from "@/lib/discovery/accelerated-growth/autonomous-queue";
export const runtime="nodejs";
export const maxDuration=300;
function valid(message:unknown):message is AgResearchQueueMessage{
 if(!message||typeof message!=="object")return false;
 const m=message as Record<string,unknown>;
 return m.version===1&&typeof m.cycleId==="string"&&typeof m.token==="string"&&m.cycleId.length===36&&m.token.length>=32;
}
export const POST=handleCallback(async(message,metadata)=>{
 if(process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_WORKER_ENABLED!=="true")return;
 if(!valid(message))throw new Error("Invalid AG autonomous research message.");
 const result=await runAuthorizedAgWorkerStep({cycleId:message.cycleId,token:message.token});
 if(result.outcome==="needs_review"||result.action==="persistence_ready"||result.action==="research_complete")return;
 const afterSeconds=result.action==="wait"?30:0;
 await enqueueAgResearchStep(message,{afterSeconds,sequence:result.invocationNumber+1});
},{
 visibilityTimeoutSeconds:300,
 retry:(error,metadata)=>{
  if(metadata.deliveryCount>=5)return {acknowledge:true};
  return {afterSeconds:Math.min(300,2**metadata.deliveryCount*5)};
 },
});
