import "server-only";
/** Isolated cross-request research executor. No active route imports this file. */
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";
import {executeAgClaimedStage} from "./resumable-stage-executor";
import {runAgDiscoveryStageWork} from "./discovery-stage-work";
import {resumeAgDeepResearchFanout,resumeAgCommitteeFanout} from "./resumable-symbol-fanout";

import {buildAgDiscoveryStagePayload} from "./research-stage-payloads";

export async function executeAgDiscoveryStage(input:{cycleId:string;rpc:AgStageCheckpointRpc}){
 return executeAgClaimedStage({cycleId:input.cycleId,stage:"discovery",rpc:input.rpc,run:async()=>{
  const result=await runAgDiscoveryStageWork();return {payload:buildAgDiscoveryStagePayload(result),result};
 }});
}
export async function executeAgCatalystDeepStage(input:{cycleId:string;rpc:AgStageCheckpointRpc;maxCandidates?:number}){
 const claim=await input.rpc.claim(input.cycleId,"catalyst_deep_research");
 return resumeAgDeepResearchFanout({cycleId:input.cycleId,parentClaim:claim,rpc:input.rpc,maxCandidates:input.maxCandidates});
}
export async function executeAgCommitteeResearchStage(input:{cycleId:string;rpc:AgStageCheckpointRpc}){
 const claim=await input.rpc.claim(input.cycleId,"committee");
 return resumeAgCommitteeFanout({cycleId:input.cycleId,parentClaim:claim,rpc:input.rpc});
}
