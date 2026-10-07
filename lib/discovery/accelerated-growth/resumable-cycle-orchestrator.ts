import "server-only";
import {createClient} from "@/lib/supabase/server";
import {denverAgCycleDate} from "./daily-cycle";
import {runNextAgResumableResearchStage} from "./resumable-daily-cycle-adapter";

export type AgResumableCycleStepResult={
 cycleId:string;cycleDate:string;status:"running";
 action:"stage_step"|"wait"|"manual_review"|"persistence_ready"|"research_complete";
 stage:string|null;persistenceReady:boolean;transactionsWritten:false;
};

/**
 * Multi-request AG research coordinator.
 *
 * This boundary deliberately cannot persist decisions, finalize a cycle, or
 * execute transactions. It creates/reuses one authoritative paper AG cycle and
 * advances at most one durable research unit per request.
 */
export async function runNextAgResumableCycleStep(input?:{maxCandidates?:number;cycleDate?:string}):Promise<AgResumableCycleStepResult>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("You must be signed in.");

 const {data:portfolio,error:portfolioError}=await supabase.from("portfolios")
  .select("id").eq("user_id",user.id).eq("type","paper_active").eq("is_real_money",false).single();
 if(portfolioError||!portfolio)throw new Error("paper_active portfolio not found.");
 const {data:era,error:eraError}=await supabase.from("portfolio_strategy_eras")
  .select("id").eq("portfolio_id",portfolio.id).eq("user_id",user.id)
  .eq("strategy_key","accelerated_growth").eq("execution_mode","paper").is("ended_at",null).single();
 if(eraError||!era)throw new Error("An open paper Accelerated Growth strategy era is required.");

 const cycleDate=input?.cycleDate??denverAgCycleDate();
 const maxCandidates=Math.max(1,Math.min(Math.trunc(input?.maxCandidates??5),5));
 const {data:runningCycles,error:runningError}=await supabase.from("ag_daily_cycles")
  .select("id,cycle_date,max_candidates,attempt_number").eq("user_id",user.id).eq("portfolio_id",portfolio.id)
  .eq("strategy_era_id",era.id).eq("status","running").limit(2);
 if(runningError)throw new Error(`Unable to inspect running AG cycles: ${runningError.message}`);
 if((runningCycles??[]).length>1)throw new Error("Multiple AG cycles are running; manual reconciliation required.");
 const priorRunning=(runningCycles??[]).find(row=>row.cycle_date!==cycleDate)??null;

 const {data:existing,error:existingError}=await supabase.from("ag_daily_cycles")
  .select("id,status,cycle_date,max_candidates,attempt_number").eq("user_id",user.id).eq("portfolio_id",portfolio.id)
  .eq("strategy_era_id",era.id).eq("cycle_date",cycleDate).order("attempt_number",{ascending:false}).limit(1).maybeSingle();
 if(existingError)throw new Error(`Unable to inspect AG daily cycle: ${existingError.message}`);
 const retryableFailed=existing?.status==="failed";
 if(existing&&existing.status!=="running"&&!retryableFailed)
  throw new Error(`Authoritative AG cycle is already ${existing.status}; no resumable research step allowed.`);

 if(priorRunning&&existing)
  throw new Error("Conflicting AG cycle state requires manual reconciliation.");
 const resumableExisting=priorRunning??(existing?.status==="running"?existing:null);
 let cycleId=resumableExisting?.id as string|undefined;
 const authoritativeCycleDate=(resumableExisting?.cycle_date as string|undefined)??cycleDate;
 if(resumableExisting&&resumableExisting.max_candidates!==maxCandidates)
  throw new Error("AG max-candidate manifest changed during resumable cycle.");

 if(!cycleId){
  const now=new Date().toISOString();
  const {data:created,error}=await supabase.from("ag_daily_cycles").insert({
   user_id:user.id,portfolio_id:portfolio.id,strategy_era_id:era.id,cycle_date:cycleDate,
   status:"running",max_candidates:maxCandidates,attempt_number:(existing?.attempt_number??0)+1,started_at:now,updated_at:now,
  }).select("id").single();
  if(error||!created)throw new Error(`Unable to create resumable AG cycle: ${error?.message??"unknown error"}`);
  cycleId=created.id;
 }
 if(!cycleId)throw new Error("AG resumable cycle identity was not established.");
 const authoritativeCycleId=cycleId;

 const step=await runNextAgResumableResearchStage({cycleId:authoritativeCycleId,maxCandidates});
 if(step.plan.action==="manual_review")
  return {cycleId:authoritativeCycleId,cycleDate:authoritativeCycleDate,status:"running",action:"manual_review",stage:step.plan.stage,persistenceReady:false,transactionsWritten:false};
 if(step.plan.action==="wait")
  return {cycleId:authoritativeCycleId,cycleDate:authoritativeCycleDate,status:"running",action:"wait",stage:step.plan.stage,persistenceReady:false,transactionsWritten:false};
 if(step.plan.action==="complete")
  return {cycleId:authoritativeCycleId,cycleDate:authoritativeCycleDate,status:"running",action:"research_complete",stage:null,persistenceReady:false,transactionsWritten:false};
 if(step.persistenceReady)
  return {cycleId:authoritativeCycleId,cycleDate:authoritativeCycleDate,status:"running",action:"persistence_ready",stage:"persistence",persistenceReady:true,transactionsWritten:false};
 return {cycleId:authoritativeCycleId,cycleDate:authoritativeCycleDate,status:"running",action:"stage_step",stage:step.executedStage,persistenceReady:false,transactionsWritten:false};
}
