import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AgStage } from "./stage-checkpoint-contract";
import type { AgStageCheckpointRpc, AgStageClaim } from "./stage-checkpoint-capture";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createAuthenticatedAgStageCheckpointRpc():Promise<AgStageCheckpointRpc>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) throw new Error("You must be signed in.");
 return {
  async claim(cycleId:string,stage:AgStage):Promise<AgStageClaim>{
   const {data,error}=await supabase.rpc("ag_claim_cycle_stage",{p_cycle_id:cycleId,p_stage:stage});
   if(error) throw new Error(`Unable to claim AG ${stage} stage: ${error.message}`);
   const row=Array.isArray(data)?data[0]:data;
   if(!row || !UUID.test(row.checkpoint_id) || !UUID.test(row.claim_token))
    throw new Error("AG stage claim returned invalid identity.");
   return {checkpointId:row.checkpoint_id,claimToken:row.claim_token,stage};
  },
  async complete(checkpointId,claimToken,output){
   const {data,error}=await supabase.rpc("ag_complete_cycle_stage",{
    p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_output:output,
   });
   if(error) throw new Error(`Unable to complete AG stage: ${error.message}`);
   if(data!==true) throw new Error("AG stage completion was rejected; reconciliation required.");
  },
 };
}
