import "server-only";
import {createClient} from "@/lib/supabase/server";
import type {AgSymbolCheckpointIo,AgSymbolParentStage,AgSymbolCheckpointRow} from "./symbol-checkpoint-orchestrator";
export async function createAuthenticatedAgSymbolCheckpointIo():Promise<AgSymbolCheckpointIo>{
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("You must be signed in.");
 return {
  async read(cycleId:string,parentStage:AgSymbolParentStage){
   const {data,error}=await supabase.rpc("ag_read_cycle_symbol_checkpoints",{p_cycle_id:cycleId,p_parent_stage:parentStage});
   if(error)throw new Error("Unable to read AG symbol checkpoints.");
   return (Array.isArray(data)?data:[]) as AgSymbolCheckpointRow[];
  },
  async claim(cycleId,parentStage,symbol){
   const {data,error}=await supabase.rpc("ag_claim_cycle_symbol",{p_cycle_id:cycleId,p_parent_stage:parentStage,p_symbol:symbol});
   if(error)throw new Error("Unable to claim AG symbol work.");
   const row=Array.isArray(data)?data[0]:data;
   return {checkpointId:row?.checkpoint_id??"",claimToken:row?.claim_token??""};
  },
  async complete(checkpointId,claimToken,output){
   const {data,error}=await supabase.rpc("ag_complete_cycle_symbol",{p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_output:output});
   return !error&&data===true;
  },
 };
}