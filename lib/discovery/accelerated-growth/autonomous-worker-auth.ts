import "server-only";
import {createHash,randomBytes,timingSafeEqual} from "node:crypto";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";

const digest=(token:string)=>createHash("sha256").update(token,"utf8").digest("hex");

export function verifyAgWorkerSecret(candidate:string|null):boolean{
 const expected=process.env.AG_AUTONOMOUS_WORKER_SECRET;
 if(!candidate||!expected)return false;
 const a=Buffer.from(candidate),b=Buffer.from(expected);
 return a.length===b.length&&timingSafeEqual(a,b);
}

export async function authorizeAuthenticatedAgWorker(cycleId:string){
 const rawToken=randomBytes(32).toString("hex");
 const supabase=await createClient();
 const {data,error}=await supabase.rpc("ag_authorize_cycle_worker",{
  p_cycle_id:cycleId,p_token_hash:digest(rawToken),p_ttl_minutes:180,p_max_invocations:32,
 });
 if(error)throw new Error(`Unable to authorize AG worker: ${error.message}`);
 if(!data)throw new Error("AG worker authorization was not created.");
 return {authorizationId:data as string,token:rawToken};
}

export async function claimAgWorker(cycleId:string,rawToken:string){
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("ag_claim_cycle_worker",{p_cycle_id:cycleId,p_token_hash:digest(rawToken)});
 if(error)throw new Error(`Unable to claim AG worker authorization: ${error.message}`);
 const row=Array.isArray(data)?data[0]:null;
 if(!row)return null;
 return {authorizationId:String(row.authorization_id),userId:String(row.user_id),invocationNumber:Number(row.invocation_number)};
}

export async function finishAgWorker(cycleId:string,rawToken:string,status:"consumed"|"revoked"){
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("ag_finish_cycle_worker",{p_cycle_id:cycleId,p_token_hash:digest(rawToken),p_terminal_status:status});
 if(error)throw new Error(`Unable to finish AG worker authorization: ${error.message}`);
 return data===true;
}
