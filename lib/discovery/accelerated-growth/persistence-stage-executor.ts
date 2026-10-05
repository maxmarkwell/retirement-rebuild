/**
 * Isolated persistence-stage orchestration. No Supabase client and no active
 * runner import. A fresh persistence claim re-keys frozen manifests.
 */
import {prepareAgPersistenceDecisionCalls} from "./persistence-stage-plan";
import {parseAgFrozenWatchIntents} from "./persistence-watch-manifest";
import {prepareAgWatchRpcBatch,type AgWatchRpcCall} from "./watchlist-persistence-adapter";
import type {AgRpcCall} from "./atomic-persistence-adapter";

export type AgPersistenceStageIo={
 claim(cycleId:string):Promise<{checkpointId:string;claimToken:string}>;
 read(cycleId:string,stage:"holding_review"|"catalyst_deep_research"|"committee"):Promise<Record<string,unknown>>;
 commitDecision(call:AgRpcCall):Promise<string>;
 commitWatch(call:AgWatchRpcCall):Promise<string>;
 verifyDecisionManifest(cycleId:string,kind:"holding_review"|"committee"):Promise<boolean>;
 verifyWatchManifest(cycleId:string):Promise<boolean>;
 complete(checkpointId:string,claimToken:string,expectedTickers:readonly string[]):Promise<boolean>;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function executeAgPersistenceStage(input:{cycleId:string;io:AgPersistenceStageIo}){
 const holding=await input.io.read(input.cycleId,"holding_review");
 const deep=await input.io.read(input.cycleId,"catalyst_deep_research");
 const committee=await input.io.read(input.cycleId,"committee");
 const watchIntents=parseAgFrozenWatchIntents({cycleId:input.cycleId,payload:deep});
 const claim=await input.io.claim(input.cycleId);
 if(!UUID.test(claim.checkpointId)||!UUID.test(claim.claimToken))
  throw new Error("Invalid AG persistence claim.");
 const decisionCalls=prepareAgPersistenceDecisionCalls({
  cycleId:input.cycleId,claimToken:claim.claimToken,holding,committee,
 });
 const watchCalls=prepareAgWatchRpcBatch(input.cycleId,claim.claimToken,watchIntents);
 const expectedTickers=decisionCalls.map(x=>x.p_ticker);
 for(const call of decisionCalls){
  const id=await input.io.commitDecision(call);
  if(!UUID.test(id))throw new Error("Ambiguous AG decision write; manual reconciliation required.");
 }
 for(const call of watchCalls){
  const id=await input.io.commitWatch(call);
  if(!UUID.test(id))throw new Error("Ambiguous AG watch write; manual reconciliation required.");
 }
 if(!await input.io.verifyDecisionManifest(input.cycleId,"holding_review")||
    !await input.io.verifyDecisionManifest(input.cycleId,"committee")||
    !await input.io.verifyWatchManifest(input.cycleId))
  throw new Error("AG persistence verification failed; manual reconciliation required.");
 if(!await input.io.complete(claim.checkpointId,claim.claimToken,expectedTickers))
  throw new Error("AG persistence completion rejected; manual reconciliation required.");
 return {checkpointId:claim.checkpointId,decisionCount:decisionCalls.length,
  watchCount:watchCalls.length,expectedTickers};
}
