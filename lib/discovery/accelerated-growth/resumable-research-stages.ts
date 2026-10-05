import "server-only";
/** Isolated cross-request research executor. No active route imports this file. */
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";
import {executeAgClaimedStage} from "./resumable-stage-executor";
import {runAgDiscoveryStageWork} from "./discovery-stage-work";
import {resumeAgDeepResearchFanout,resumeAgCommitteeFanout} from "./resumable-symbol-fanout";

import {buildAgDiscoveryStagePayload,buildAgCatalystDeepStagePayload,parseAgDiscoveryStagePayload,parseAgDeepResearchResults} from "./research-stage-payloads";
import {readAuthenticatedAgCompletedStageOutput} from "./stage-output-reader";
import {deriveAgExecutionEvidence} from "./execution-evidence";
import {captureAgCommitteeIntent} from "./immutable-intent-capture";

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
 const discoveryEnvelope=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"discovery"});
 if(!discoveryEnvelope) throw new Error("Completed AG Discovery checkpoint required for Committee evidence.");
 const discovery=parseAgDiscoveryStagePayload(discoveryEnvelope.payload);
 return executeAgClaimedStage({cycleId:input.cycleId,stage:"committee",rpc:input.rpc,run:async claim=>{
  const result=await runAgCommitteeStage(research);
  const evidenceByTicker=Object.fromEntries(result.eligibleSymbols.map(ticker=>{
   const frozen=discovery.discovery.executionEvidenceInputs[ticker];
   if(!frozen) throw new Error(`Missing frozen AG execution evidence for ${ticker}`);
   return [ticker,deriveAgExecutionEvidence(frozen)];
  }));
  const payload=captureAgCommitteeIntent({cycleId:input.cycleId,claimToken:claim.claimToken,
   eligibleSymbols:result.eligibleSymbols,decisions:result.decisions,failedCount:0,errors:[],evidenceByTicker});
  return {payload,result};
 }});
}
