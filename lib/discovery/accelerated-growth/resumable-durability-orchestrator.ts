import "server-only";
import {createClient} from "@/lib/supabase/server";
import {executeAgPersistenceStage} from "./persistence-stage-executor";
import {createAuthenticatedAgPersistenceIo} from "./persistence-stage-supabase";
import {createAuthenticatedAgCycleFinalizationIo} from "./cycle-finalization-supabase";

export type AgDurabilityStepResult={cycleId:string;action:"persistence_completed"|"cycle_finalized"|"wait"|"manual_review";status:"running"|"completed";transactionsWritten:false;};

export async function runNextAgDurabilityStep(input:{cycleId:string}):Promise<AgDurabilityStepResult>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("You must be signed in.");
 const {data:cycle,error}=await supabase.from("ag_daily_cycles").select("id,status,portfolio_id,strategy_era_id").eq("id",input.cycleId).eq("user_id",user.id).single();
 if(error||!cycle)throw new Error("Authoritative AG cycle not found.");
 if(cycle.status==="completed")return {cycleId:cycle.id,action:"cycle_finalized",status:"completed",transactionsWritten:false};
 if(cycle.status!=="running")return {cycleId:cycle.id,action:"manual_review",status:"running",transactionsWritten:false};
 const {data:portfolio}=await supabase.from("portfolios").select("id").eq("id",cycle.portfolio_id).eq("user_id",user.id).eq("type","paper_active").eq("is_real_money",false).maybeSingle();
 const {data:era}=await supabase.from("portfolio_strategy_eras").select("id").eq("id",cycle.strategy_era_id).eq("portfolio_id",cycle.portfolio_id).eq("user_id",user.id).eq("strategy_key","accelerated_growth").eq("execution_mode","paper").is("ended_at",null).maybeSingle();
 if(!portfolio||!era)throw new Error("Active paper AG portfolio and era required.");
 const {data:rows,error:checkpointError}=await supabase.rpc("ag_read_cycle_checkpoint_status",{p_cycle_id:cycle.id});
 if(checkpointError)throw new Error(`Unable to inspect AG checkpoints: ${checkpointError.message}`);
 const checkpoints=Array.isArray(rows)?rows:[];
 const byStage=new Map(checkpoints.map((row:any)=>[row.stage,row]));
 const persistence=byStage.get("persistence") as any;
 if(!persistence||persistence.status==="pending"){
  const research=["holding_review","discovery","catalyst_deep_research","committee"];
  if(!research.every(stage=>(byStage.get(stage) as any)?.status==="completed"))return {cycleId:cycle.id,action:"wait",status:"running",transactionsWritten:false};
  const io=await createAuthenticatedAgPersistenceIo();
  await executeAgPersistenceStage({cycleId:cycle.id,io});
  return {cycleId:cycle.id,action:"persistence_completed",status:"running",transactionsWritten:false};
 }
 if(persistence.status!=="completed")return {cycleId:cycle.id,action:"manual_review",status:"running",transactionsWritten:false};
 const finalized=byStage.get("finalized") as any;
 if(finalized&&finalized.status!=="pending")return {cycleId:cycle.id,action:"manual_review",status:"running",transactionsWritten:false};
 const io=await createAuthenticatedAgCycleFinalizationIo();
 const claim=await io.claim(cycle.id);
 if(!claim.checkpointId||!claim.claimToken)throw new Error("Invalid AG finalization claim.");
 if(!await io.finalize(claim.checkpointId,claim.claimToken))throw new Error("AG finalization rejected; reconcile authoritative cycle state before retry.");
 return {cycleId:cycle.id,action:"cycle_finalized",status:"completed",transactionsWritten:false};
}
