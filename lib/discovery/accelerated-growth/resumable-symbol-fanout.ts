import "server-only";
/** Child-checkpoint fan-out for the isolated resumable research path only. */
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";
import {readAuthenticatedAgCompletedStageOutput} from "./stage-output-reader";
import {parseAgDiscoveryStagePayload,buildAgCatalystDeepStagePayload,parseAgDeepResearchResults} from "./research-stage-payloads";
import {deriveAgPostDiscoveryPlan} from "./post-discovery-plan";
import {runAgCatalystDeepSymbolWork} from "./catalyst-deep-stage-work";
import {runAgCommitteeSymbolWork} from "./committee-stage-work";
import {aggregateAgDeepSymbolOutputs,aggregateAgCommitteeSymbolOutputs} from "./symbol-stage-aggregation";
import {createAuthenticatedAgSymbolCheckpointIo} from "./symbol-checkpoint-supabase";
import {runNextAgSymbolWork} from "./symbol-checkpoint-orchestrator";
import {deriveAgExecutionEvidence} from "./execution-evidence";
import {captureAgCommitteeIntent} from "./immutable-intent-capture";
import {validateAgStageEnvelope} from "./stage-checkpoint-contract";

export async function resumeAgDeepResearchFanout(input:{cycleId:string;parentClaim:{checkpointId:string;claimToken:string};rpc:AgStageCheckpointRpc;maxCandidates?:number}){
 const env=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"discovery"});
 if(!env)throw new Error("Completed AG Discovery checkpoint required.");
 const discovery=parseAgDiscoveryStagePayload(env.payload),plan=deriveAgPostDiscoveryPlan(discovery,input.maxCandidates);
 const expected=plan.selected.map(x=>x.symbol),io=await createAuthenticatedAgSymbolCheckpointIo();
 const step=await runNextAgSymbolWork({cycleId:input.cycleId,parentStage:"catalyst_deep_research",expectedSymbols:expected,io,
  work:async symbol=>{const candidate=plan.selected.find(x=>x.symbol===symbol);if(!candidate)throw new Error("AG deep symbol absent from frozen plan.");return runAgCatalystDeepSymbolWork({candidate,discovery});}});
 if(step.action!=="AGGREGATE")return {completed:false,step};
 const result=aggregateAgDeepSymbolOutputs({selectedSymbols:expected,outputs:step.outputs as any,
  quantitativeWatchResolutions:plan.quantitativeWatchResolutions,committeeWatchResolutions:plan.committeeWatchResolutions});
 const payload=buildAgCatalystDeepStagePayload({cycleId:input.cycleId,result});
 await input.rpc.complete(input.parentClaim.checkpointId,input.parentClaim.claimToken,validateAgStageEnvelope({version:1,cycleId:input.cycleId,stage:"catalyst_deep_research",completedAt:new Date().toISOString(),payload},{cycleId:input.cycleId,stage:"catalyst_deep_research"}));
 return {completed:true,step};
}

export async function resumeAgCommitteeFanout(input:{cycleId:string;parentClaim:{checkpointId:string;claimToken:string};rpc:AgStageCheckpointRpc}){
 const deep=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"catalyst_deep_research"});
 if(!deep)throw new Error("Completed AG deep-research checkpoint required.");
 const research=parseAgDeepResearchResults(deep.payload).filter(x=>x.researchStatus==="PROCEED"),expected=research.map(x=>x.symbol);
 const io=await createAuthenticatedAgSymbolCheckpointIo();
 const step=await runNextAgSymbolWork({cycleId:input.cycleId,parentStage:"committee",expectedSymbols:expected,io,
  work:async symbol=>{const item=research.find(x=>x.symbol===symbol);if(!item)throw new Error("AG Committee symbol absent from frozen manifest.");return runAgCommitteeSymbolWork(item);}});
 if(step.action!=="AGGREGATE")return {completed:false,step};
 const result=aggregateAgCommitteeSymbolOutputs({eligibleSymbols:expected,decisions:step.outputs as any});
 const discoveryEnv=await readAuthenticatedAgCompletedStageOutput({cycleId:input.cycleId,stage:"discovery"});
 if(!discoveryEnv)throw new Error("Completed AG Discovery checkpoint required for Committee evidence.");
 const discovery=parseAgDiscoveryStagePayload(discoveryEnv.payload);
 const evidenceByTicker=Object.fromEntries(result.eligibleSymbols.map(t=>{const frozen=discovery.discovery.executionEvidenceInputs[t];if(!frozen)throw new Error(`Missing frozen AG execution evidence for ${t}`);return[t,deriveAgExecutionEvidence(frozen)];}));
 const payload=captureAgCommitteeIntent({cycleId:input.cycleId,claimToken:input.parentClaim.claimToken,eligibleSymbols:result.eligibleSymbols,decisions:result.decisions,failedCount:0,errors:[],evidenceByTicker});
 await input.rpc.complete(input.parentClaim.checkpointId,input.parentClaim.claimToken,validateAgStageEnvelope({version:1,cycleId:input.cycleId,stage:"committee",completedAt:new Date().toISOString(),payload},{cycleId:input.cycleId,stage:"committee"}));
 return {completed:true,step};
}