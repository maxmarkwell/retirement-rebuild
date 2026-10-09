import "server-only";
import {createClient} from "@/lib/supabase/server";
import type {AgStage,AgStageEnvelope} from "./stage-checkpoint-contract";
import {validateAgStageEnvelope} from "./stage-checkpoint-contract";

export async function readAuthenticatedAgCompletedStageOutput(input:{
 cycleId:string;stage:AgStage;
}):Promise<AgStageEnvelope|null>{
 const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) throw new Error("You must be signed in.");
 const {data,error}=await supabase.rpc("ag_read_completed_stage_output",{
  p_cycle_id:input.cycleId,p_stage:input.stage,
 });
 if(error) throw new Error(`Unable to read completed AG stage output: ${error.message}`);
 const row=Array.isArray(data)?data[0]:data;
 if(!row) return null;
 // PostgreSQL stores the validated stage payload; cycle/stage/completion time
 // are trusted checkpoint metadata. Reconstruct and revalidate the application envelope.
 return validateAgStageEnvelope({
  version:1,cycleId:input.cycleId,stage:row.stage,completedAt:row.completed_at,payload:row.output,
 },{cycleId:input.cycleId,stage:input.stage});
}
