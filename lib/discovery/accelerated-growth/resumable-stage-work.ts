import "server-only";
/** Isolated genuine stage work. Not imported by the active daily-cycle runner. */
import {runAgHoldingReviewPipeline, type AgHoldingReviewPipelineResult} from "./holding-review-pipeline";
import {buildAgHoldingCheckpointPayload} from "./stage-payload-builders";
import {executeAgClaimedStage} from "./resumable-stage-executor";
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";

export async function executeAgHoldingReviewStage(input:{
 cycleId:string;rpc:AgStageCheckpointRpc;
 runPipeline?:()=>Promise<AgHoldingReviewPipelineResult>;
}){
 return executeAgClaimedStage({
  cycleId:input.cycleId,stage:"holding_review",rpc:input.rpc,
  run:async claim=>{
   const result=await (input.runPipeline??runAgHoldingReviewPipeline)();
   const payload=buildAgHoldingCheckpointPayload({
    cycleId:input.cycleId,claimToken:claim.claimToken,result,
   });
   return {payload,result};
  },
 });
}
