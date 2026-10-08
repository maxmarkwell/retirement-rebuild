import "server-only";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {AG_STAGE_ORDER,validateAgStageEnvelope,type AgStage} from "./stage-checkpoint-contract";
import type {AgCycleExecutionContext} from "./cycle-execution-context";
import type {AgSymbolCheckpointRow} from "./symbol-checkpoint-orchestrator";
const digest=(token:string)=>createHash("sha256").update(token,"utf8").digest("hex");
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createWorkerAgExecutionContext(input:{cycleId:string;userId:string;authorizationId:string;token:string}):AgCycleExecutionContext{
 const admin=createAdminClient(),tokenHash=digest(input.token);
 const base={p_authorization_id:input.authorizationId,p_cycle_id:input.cycleId,p_token_hash:tokenHash};
 const same=(cycleId:string)=>{if(cycleId!==input.cycleId)throw new Error("AG worker cycle mismatch.");};
 return {cycleId:input.cycleId,userId:input.userId,
  async readCheckpointStatus(cycleId){same(cycleId);const {data,error}=await admin.rpc("ag_worker_read_cycle_checkpoint_status",base);if(error)throw new Error("Unable to read worker AG checkpoint status: "+error.message);return (data??[]).map((row:any)=>{if(!AG_STAGE_ORDER.includes(row.stage)||!["pending","running","completed","failed","needs_manual_review"].includes(row.status))throw new Error("Invalid worker AG checkpoint state.");return {checkpointId:row.checkpoint_id,stage:row.stage,status:row.status,attemptCount:row.attempt_count,startedAt:row.started_at,completedAt:row.completed_at,leaseExpiresAt:row.lease_expires_at,updatedAt:row.updated_at};});},
  async createStageRpc(){return {
   async claim(cycleId,stage){same(cycleId);const {data,error}=await admin.rpc("ag_worker_claim_cycle_stage",{...base,p_stage:stage});if(error)throw new Error("Unable to claim worker AG stage: "+error.message);const row=Array.isArray(data)?data[0]:data;if(!row||!UUID.test(row.checkpoint_id)||!UUID.test(row.claim_token))throw new Error("Invalid worker AG stage claim.");return {checkpointId:row.checkpoint_id,claimToken:row.claim_token,stage};},
   async complete(checkpointId,claimToken,output){const {data,error}=await admin.rpc("ag_worker_complete_cycle_stage",{...base,p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_output:output.payload});if(error||data!==true)throw new Error("Worker AG stage completion rejected"+(error?": "+error.message:"")+".");},
  };},
  async reclaimExpiredSymbolParent(cycleId,stage){same(cycleId);const {data,error}=await admin.rpc("ag_worker_reclaim_expired_symbol_parent_stage",{...base,p_stage:stage});if(error)throw new Error("Unable to reclaim worker AG parent: "+error.message);const row=Array.isArray(data)?data[0]:data;if(!row||!UUID.test(row.checkpoint_id)||!UUID.test(row.claim_token))throw new Error("Invalid worker AG parent reclaim.");return {checkpointId:row.checkpoint_id,claimToken:row.claim_token,stage};},
  async createSymbolIo(){return {
   async read(cycleId,parentStage){same(cycleId);const {data,error}=await admin.rpc("ag_worker_read_cycle_symbol_checkpoints",{...base,p_parent_stage:parentStage});if(error)throw new Error("Unable to read worker AG symbol checkpoints.");return (data??[]) as AgSymbolCheckpointRow[];},
   async claim(cycleId,parentStage,symbol){same(cycleId);const {data,error}=await admin.rpc("ag_worker_claim_cycle_symbol",{...base,p_parent_stage:parentStage,p_symbol:symbol});if(error)throw new Error("Unable to claim worker AG symbol.");const row=Array.isArray(data)?data[0]:data;return {checkpointId:row?.checkpoint_id??"",claimToken:row?.claim_token??""};},
   async complete(checkpointId,claimToken,output){const {data,error}=await admin.rpc("ag_worker_complete_cycle_symbol",{...base,p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_output:output});return !error&&data===true;},
  };},
  async readCompletedStageOutput({cycleId,stage}:{cycleId:string;stage:AgStage}){same(cycleId);const {data,error}=await admin.rpc("ag_worker_read_completed_stage_output",{...base,p_stage:stage});if(error)throw new Error("Unable to read worker AG stage output: "+error.message);const row=Array.isArray(data)?data[0]:data;if(!row)return null;return validateAgStageEnvelope({version:1,cycleId,stage:row.stage,completedAt:row.completed_at,payload:row.output},{cycleId,stage});},
  async readDiscoveryContext(){const {data,error}=await admin.rpc("ag_worker_read_discovery_context",base);if(error)throw new Error("Unable to read worker AG discovery context: "+error.message);return data;},
  async markStageNeedsReview(checkpointId,errorMessage){const {data,error}=await admin.rpc("ag_worker_mark_cycle_stage_needs_review",{...base,p_checkpoint_id:checkpointId,p_error_message:errorMessage});if(error)throw new Error("Unable to mark worker AG stage for review: "+error.message);return data===true;},
 };
}
