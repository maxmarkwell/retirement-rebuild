import {AG_STAGE_ORDER,type AgStage} from "./stage-checkpoint-contract";
import type {AgCheckpointStatus} from "./stage-checkpoint-status-reader";

export type AgResumePlan=
 | {action:"run";stage:AgStage}
 | {action:"wait";stage:AgStage;reason:"active_lease"}
 | {action:"manual_review";stage:AgStage;reason:"stale_or_failed"|"explicit_review"}
 | {action:"complete"};

export function planAgResume(rows:readonly AgCheckpointStatus[],nowMs=Date.now()):AgResumePlan{
 const byStage=new Map<AgStage,AgCheckpointStatus>();
 for(const row of rows){
  if(byStage.has(row.stage)) throw new Error("Duplicate AG checkpoint stage status.");
  byStage.set(row.stage,row);
 }
 for(const stage of AG_STAGE_ORDER){
  const row=byStage.get(stage);
  if(!row || row.status==="pending") return {action:"run",stage};
  if(row.status==="completed") continue;
  if(row.status==="needs_manual_review") return {action:"manual_review",stage,reason:"explicit_review"};
  if(row.status==="failed") return {action:"manual_review",stage,reason:"stale_or_failed"};
  if(row.status==="running"){
   const lease=row.leaseExpiresAt?Date.parse(row.leaseExpiresAt):NaN;
   if(Number.isFinite(lease) && lease>nowMs) return {action:"wait",stage,reason:"active_lease"};
   return {action:"manual_review",stage,reason:"stale_or_failed"};
  }
 }
 return {action:"complete"};
}
