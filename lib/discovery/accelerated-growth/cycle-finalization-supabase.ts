import "server-only";
import {createClient} from "@/lib/supabase/server";

export type AgCycleFinalizationIo={
 claim(cycleId:string):Promise<{checkpointId:string;claimToken:string}>;
 finalize(checkpointId:string,claimToken:string):Promise<boolean>;
};

/**
 * Isolated authenticated transport. Not imported by the research-only route.
 * Claiming finalized is server-enforced to require completed persistence.
 */
export async function createAuthenticatedAgCycleFinalizationIo():Promise<AgCycleFinalizationIo>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)throw new Error("You must be signed in.");
 return {
  async claim(cycleId){
   const {data,error}=await supabase.rpc("ag_claim_cycle_stage",{p_cycle_id:cycleId,p_stage:"finalized"});
   if(error)throw new Error(`Unable to claim AG finalization stage: ${error.message}`);
   const row=Array.isArray(data)?data[0]:data;
   return {checkpointId:row?.checkpoint_id??"",claimToken:row?.claim_token??""};
  },
  async finalize(checkpointId,claimToken){
   const {data,error}=await supabase.rpc("ag_finalize_daily_cycle",{
    p_checkpoint_id:checkpointId,p_claim_token:claimToken,
   });
   if(error)throw new Error(`AG finalization outcome unknown: ${error.message}`);
   return data===true;
  },
 };
}
