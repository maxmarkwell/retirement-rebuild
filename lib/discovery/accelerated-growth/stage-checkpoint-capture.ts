/** Isolated orchestration for durable AG stage evidence.
 * NOT imported by the active daily-cycle runner. This module can only claim
 * and complete checkpoints; it never persists decisions/watchlist rows or
 * executes transactions.
 */
import { validateAgStageEnvelope, type AgStage, type AgStageEnvelope } from "./stage-checkpoint-contract";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgStageClaim={checkpointId:string;claimToken:string;stage:AgStage};
export type AgStageCheckpointRpc={
  claim(cycleId:string,stage:AgStage):Promise<AgStageClaim>;
  complete(checkpointId:string,claimToken:string,output:AgStageEnvelope):Promise<void>;
};

export async function captureAgStageCheckpoint(input:{
  cycleId:string;stage:AgStage;payload:Record<string,unknown>;
  rpc:AgStageCheckpointRpc;completedAt?:string;
}):Promise<{checkpointId:string;stage:AgStage}>{
  if(!UUID.test(input.cycleId) || !input.rpc ||
     typeof input.rpc.claim!=="function" || typeof input.rpc.complete!=="function"){
    throw new Error("Invalid AG stage checkpoint capture request");
  }
  // Clone before any await so later mutation of pipeline-owned objects cannot
  // change the evidence submitted after a network boundary.
  const frozenPayload=structuredClone(input.payload);
  const completedAt=input.completedAt??new Date().toISOString();
  const envelope=validateAgStageEnvelope({
    version:1,cycleId:input.cycleId,stage:input.stage,completedAt,payload:frozenPayload,
  },{cycleId:input.cycleId,stage:input.stage});

  const claim=await input.rpc.claim(input.cycleId,input.stage);
  if(!claim || !UUID.test(claim.checkpointId) || !UUID.test(claim.claimToken) ||
     claim.stage!==input.stage){
    throw new Error("Invalid AG stage claim response");
  }
  await input.rpc.complete(claim.checkpointId,claim.claimToken,envelope);
  return {checkpointId:claim.checkpointId,stage:claim.stage};
}
