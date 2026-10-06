import "server-only";
import {send} from "@vercel/queue";
export const AG_AUTONOMOUS_RESEARCH_TOPIC="ag-autonomous-research-v1";
export const AG_AUTONOMOUS_DURABILITY_TOPIC="ag-autonomous-durability-v1";
export type AgResearchQueueMessage={version:1;cycleId:string;token:string};
export async function enqueueAgResearchStep(message:AgResearchQueueMessage,input?:{afterSeconds?:number;sequence?:number}){
 if(process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true")throw new Error("AG autonomous queue is disabled.");
 const sequence=input?.sequence??1;
 return send(AG_AUTONOMOUS_RESEARCH_TOPIC,message,{
  idempotencyKey:`${message.cycleId}:research:${sequence}`,
  retentionSeconds:21600,
  delaySeconds:input?.afterSeconds??0,
 });
}
export async function enqueueAgDurabilityStep(message:AgResearchQueueMessage,input?:{afterSeconds?:number;sequence?:number}){
 if(process.env.AG_AUTONOMOUS_QUEUE_ENABLED!=="true"||process.env.AG_AUTONOMOUS_DURABILITY_ENABLED!=="true")throw new Error("AG autonomous durability queue is disabled.");
 const sequence=input?.sequence??1;
 return send(AG_AUTONOMOUS_DURABILITY_TOPIC,message,{idempotencyKey:`${message.cycleId}:durability:${sequence}`,retentionSeconds:21600,delaySeconds:input?.afterSeconds??0});
}
