import "server-only";
import {createClient} from "@/lib/supabase/server";
import {AG_STAGE_ORDER,type AgStage} from "./stage-checkpoint-contract";

export type AgCheckpointStatus={
 checkpointId:string;stage:AgStage;status:"pending"|"running"|"completed"|"failed"|"needs_manual_review";
 attemptCount:number;startedAt:string|null;completedAt:string|null;leaseExpiresAt:string|null;updatedAt:string;
};

export async function readAuthenticatedAgCheckpointStatus(cycleId:string):Promise<AgCheckpointStatus[]>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) throw new Error("You must be signed in.");
 const {data,error}=await supabase.rpc("ag_read_cycle_checkpoint_status",{p_cycle_id:cycleId});
 if(error) throw new Error(`Unable to read AG checkpoint status: ${error.message}`);
 return (data??[]).map((row:any)=>{
  if(!AG_STAGE_ORDER.includes(row.stage) || !["pending","running","completed","failed","needs_manual_review"].includes(row.status))
   throw new Error("AG checkpoint status returned invalid state.");
  return {checkpointId:row.checkpoint_id,stage:row.stage,status:row.status,attemptCount:row.attempt_count,
   startedAt:row.started_at,completedAt:row.completed_at,leaseExpiresAt:row.lease_expires_at,updatedAt:row.updated_at};
 });
}
