/** Pure assembly of genuine pipeline results into checkpoint payloads.
 * No Supabase client, persistence RPC, transaction execution, or runner import.
 */
import { captureAgCommitteeIntent, captureAgHoldingIntent, type AgCommitteeEvidence } from "./immutable-intent-capture";
import { captureAgWatchlistIntent } from "./watchlist-intent-capture";
import type { AgCommitteePipelineResult } from "./committee-pipeline";
import type { AgHoldingReviewPipelineResult } from "./holding-review-pipeline";

export function buildAgHoldingCheckpointPayload(input:{
 cycleId:string;claimToken:string;result:AgHoldingReviewPipelineResult;
}){
 return captureAgHoldingIntent({
  cycleId:input.cycleId,claimToken:input.claimToken,
  eligibleSymbols:input.result.eligibleSymbols,decisions:input.result.decisions,
  failedCount:input.result.failedCount,errors:input.result.errors,
 });
}

export function buildAgCommitteeCheckpointPayload(input:{
 cycleId:string;claimToken:string;result:AgCommitteePipelineResult;
 evidenceByTicker:Readonly<Record<string,AgCommitteeEvidence>>;
}){
 return captureAgCommitteeIntent({
  cycleId:input.cycleId,claimToken:input.claimToken,
  eligibleSymbols:input.result.eligibleSymbols,decisions:input.result.decisions,
  failedCount:input.result.failedCount,errors:input.result.errors,
  evidenceByTicker:input.evidenceByTicker,
 });
}

export function buildAgDeepResearchCheckpointPayload(input:{
 cycleId:string;result:AgCommitteePipelineResult;
}){
 const upstream=input.result.upstream;
 const watch=captureAgWatchlistIntent({
  cycleId:input.cycleId,
  outcomes:upstream.deepResearchOutcomes.map(x=>({...x,priorWatchRowId:
    (x as typeof x & {priorWatchRowId?:string|null}).priorWatchRowId??null})),
  quantitativeResolutions:upstream.quantitativeWatchResolutions,
  committeeResolutions:upstream.committeeWatchResolutions,
  upstreamErrors:input.result.errors.filter(x=>x.stage==="UPSTREAM"),
  upstreamFailedCount:input.result.errors.filter(x=>x.stage==="UPSTREAM").length,
  discoveryRateLimited:upstream.discovery.rateLimited,
  discoveryStoppedEarly:upstream.discovery.stoppedEarly,
 });
 return {watchlist_intent_count:watch.intent_count,watchlist_intents:watch.intents};
}
