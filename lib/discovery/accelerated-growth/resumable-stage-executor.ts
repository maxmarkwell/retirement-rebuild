/** One-stage resumable AG executor.
 * Claims before work begins and completes only after work returns a validated
 * payload. No decision/watch persistence or transaction execution authority.
 */
import { validateAgStageEnvelope, type AgStage } from "./stage-checkpoint-contract";
import type { AgStageCheckpointRpc, AgStageClaim } from "./stage-checkpoint-capture";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function executeAgClaimedStage<T>(input:{
 cycleId:string;stage:AgStage;rpc:AgStageCheckpointRpc;
 run:(claim:Readonly<AgStageClaim>)=>Promise<{payload:Record<string,unknown>;result:T}>;
 completedAt?:()=>string;
}):Promise<{checkpointId:string;stage:AgStage;result:T}>{
 if(!UUID.test(input.cycleId)) throw new Error("Invalid AG cycle identity.");
 const claim=await input.rpc.claim(input.cycleId,input.stage);
 if(!claim || claim.stage!==input.stage || !UUID.test(claim.checkpointId) || !UUID.test(claim.claimToken))
  throw new Error("Invalid AG stage claim response.");

 // Work starts only after ownership is established. Any thrown error leaves the
 // checkpoint uncompleted for explicit recovery/lease review.
 const completed=await input.run(Object.freeze({...claim}));
 const frozenPayload=structuredClone(completed.payload);
 const envelope=validateAgStageEnvelope({
  version:1,cycleId:input.cycleId,stage:input.stage,
  completedAt:(input.completedAt??(()=>new Date().toISOString()))(),
  payload:frozenPayload,
 },{cycleId:input.cycleId,stage:input.stage});
 await input.rpc.complete(claim.checkpointId,claim.claimToken,envelope);
 return {checkpointId:claim.checkpointId,stage:claim.stage,result:completed.result};
}
