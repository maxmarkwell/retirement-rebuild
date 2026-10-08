import "server-only";
import {runNextAgResumableCycleStep,type AgResumableCycleStepResult} from "./resumable-cycle-orchestrator";
import {runNextAgDurabilityStep,type AgDurabilityStepResult} from "./resumable-durability-orchestrator";

export type AgAutonomousStepResult={
 cycleId:string;
 cycleDate:string;
 outcome:"continue"|"completed"|"needs_review";
 stage:string|null;
 action:string;
 transactionsWritten:false;
};

/**
 * Advances exactly one durable AG unit.
 *
 * This coordinator is intentionally transport-agnostic: it does not loop,
 * recurse, self-fetch, schedule work, or execute transactions. A separately
 * gated worker transport may call it again only after this invocation returns
 * and its durable checkpoint has committed.
 */
export async function runNextAgAutonomousStep(input?:{
 maxCandidates?:number;
 cycleDate?:string;
 durabilityEnabled?:boolean;
}):Promise<AgAutonomousStepResult>{
 const research:AgResumableCycleStepResult=await runNextAgResumableCycleStep({
  maxCandidates:input?.maxCandidates,
  cycleDate:input?.cycleDate,
 });

 if(research.action==="manual_review"){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"needs_review",stage:research.stage,action:research.action,transactionsWritten:false};
 }
 if(research.action==="wait"){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"continue",stage:research.stage,action:research.action,transactionsWritten:false};
 }

 const durabilityReady=research.persistenceReady||research.action==="research_complete";
 if(!durabilityReady){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"continue",stage:research.stage,action:research.action,transactionsWritten:false};
 }
 if(input?.durabilityEnabled!==true){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"needs_review",stage:"persistence",action:"durability_disabled",transactionsWritten:false};
 }

 const durable:AgDurabilityStepResult=await runNextAgDurabilityStep({cycleId:research.cycleId});
 if(durable.action==="manual_review"){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"needs_review",stage:"persistence",action:durable.action,transactionsWritten:false};
 }
 if(durable.status==="completed"){
  return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"completed",stage:"finalized",action:durable.action,transactionsWritten:false};
 }
 return {cycleId:research.cycleId,cycleDate:research.cycleDate,outcome:"continue",stage:durable.action==="persistence_completed"?"finalized":"persistence",action:durable.action,transactionsWritten:false};
}
