import "server-only";
/** Isolated cross-request research executor. No active route imports this file. */
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";
import {executeAgClaimedStage} from "./resumable-stage-executor";
import {runAgDiscoveryStageWork} from "./discovery-stage-work";
import {runAgCatalystDeepResearchStage} from "./catalyst-deep-stage-work";
import {runAgCommitteeStage} from "./committee-stage-work";
import {buildAgDiscoveryStagePayload,buildAgCatalystDeepStagePayload,parseAgDiscoveryStagePayload,parseAgDeepResearchResults} from "./research-stage-payloads";
import {readAuthenticatedAgCompletedStageOutput} from "./stage-output-reader";

export async function executeAgDiscoveryStage(input:{cycleId:string;rpc:AgStageCheckpointRpc}){
 return executeAgClaimedStage({cycleId:input.cycleId,stage:"discovery",rpc:input.rpc,run:async()=>{
  const result=await runAgDiscoveryStageWork();return {payload:buildAgDiscoveryStagePayload(result),result};
 }});
}
export async function executeAgCatalystDeepStage(input:{cycleId:string;rpc:AgStageCheckpointRpc;maxCandidates?:number}){
 const prior=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"discovery"});
 if(!prior) throw new Error("Completed AG Discovery checkpoint required.");
 const discovery=parseAgDiscoveryStagePayload(prior.payload);
 return executeAgClaimedStage({cycleId:input.cycleId,stage:"catalyst_deep_research",rpc:input.rpc,run:async()=>{
  const result=await runAgCatalystDeepResearchStage({discovery,maxCandidates:input.maxCandidates});
  return {payload:buildAgCatalystDeepStagePayload({cycleId:input.cycleId,result}),result};
 }});
}
export async function executeAgCommitteeResearchStage(input:{cycleId:string;rpc:AgStageCheckpointRpc}){
 const prior=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"catalyst_deep_research"});
 if(!prior) throw new Error("Completed AG deep-research checkpoint required.");
 const research=parseAgDeepResearchResults(prior.payload);
 return executeAgClaimedStage({cycleId:input.cycleId,stage:"committee",rpc:input.rpc,run:async()=>{
  const result=await runAgCommitteeStage(research);
  // Decision persistence payload/evidence is deliberately not synthesized here.
  // Committee completion remains blocked until immutable execution evidence is
  // derived from the frozen Discovery universe rather than re-read later.
  return {payload:{eligible_symbols:result.eligibleSymbols,source_decisions:structuredClone(result.decisions)},result};
 }});
}
