import "server-only";
/** Authenticated transport for the isolated AG persistence executor.
 * This module is intentionally not imported by the active daily-cycle runner.
 */
import {createClient} from "@/lib/supabase/server";
import {readAuthenticatedAgCompletedStageOutput} from "./stage-output-reader";
import type {AgPersistenceStageIo} from "./persistence-stage-executor";

export async function createAuthenticatedAgPersistenceIo():Promise<AgPersistenceStageIo>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("You must be signed in.");
 return {
  async read(cycleId,stage){
   const row=await readAuthenticatedAgCompletedStageOutput({cycleId,stage});
   if(!row)throw new Error(`Completed AG ${stage} checkpoint required.`);
   return row.payload;
  },
  async claim(cycleId){
   const {data,error}=await supabase.rpc("ag_claim_cycle_stage",{p_cycle_id:cycleId,p_stage:"persistence"});
   if(error)throw new Error(`Unable to claim AG persistence stage: ${error.message}`);
   const row=Array.isArray(data)?data[0]:data;
   return {checkpointId:row?.checkpoint_id??"",claimToken:row?.claim_token??""};
  },
  async commitDecision(call){
   const {data,error}=await supabase.rpc("ag_commit_cycle_decision",call);
   if(error)throw new Error(`AG decision write outcome unknown: ${error.message}`);
   return typeof data==="string"?data:"";
  },
  async commitWatch(call){
   const {data,error}=await supabase.rpc("ag_commit_watch_operation",call);
   if(error)throw new Error(`AG watch write outcome unknown: ${error.message}`);
   return typeof data==="string"?data:"";
  },
  async verifyDecisionManifest(cycleId,kind){
   const fn=kind==="holding_review"?"ag_verify_holding_payload_manifest":"ag_verify_committee_payload_manifest";
   const {data,error}=await supabase.rpc(fn,{p_cycle_id:cycleId});
   return !error&&data===true;
  },
  async verifyWatchManifest(cycleId){
   const {data,error}=await supabase.rpc("ag_verify_cycle_watch_manifest",{p_cycle_id:cycleId});
   return !error&&data===true;
  },
  async complete(checkpointId,claimToken,expectedTickers){
   const {data,error}=await supabase.rpc("ag_complete_persistence_stage",{
    p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_expected_tickers:[...expectedTickers],
   });
   return !error&&data===true;
  },
 };
}
