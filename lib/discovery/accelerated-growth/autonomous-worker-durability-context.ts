import "server-only";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {createWorkerAgExecutionContext} from "./autonomous-worker-context";
import type {AgPersistenceStageIo} from "./persistence-stage-executor";
import type {AgCycleFinalizationIo} from "./cycle-finalization-supabase";

const digest=(token:string)=>createHash("sha256").update(token,"utf8").digest("hex");
export async function createWorkerAgDurabilityIo(input:{cycleId:string;userId:string;authorizationId:string;token:string}):Promise<{persistence:AgPersistenceStageIo;finalization:AgCycleFinalizationIo}>{
 const admin=createAdminClient(),tokenHash=digest(input.token);
 const base={p_authorization_id:input.authorizationId,p_cycle_id:input.cycleId,p_token_hash:tokenHash};
 const context=createWorkerAgExecutionContext(input);
 const stageRpc=await context.createStageRpc();
 const same=(cycleId:string)=>{if(cycleId!==input.cycleId)throw new Error("AG worker durability cycle mismatch.");};
 return {
  persistence:{
   async read(cycleId,stage){same(cycleId);const row=await context.readCompletedStageOutput({cycleId,stage});if(!row)throw new Error(`Completed AG ${stage} checkpoint required.`);return row.payload;},
   async claim(cycleId){same(cycleId);const row=await stageRpc.claim(cycleId,"persistence");return {checkpointId:row.checkpointId,claimToken:row.claimToken};},
   async commitDecision(call){same(call.p_cycle_id);const {data,error}=await admin.rpc("ag_worker_commit_cycle_decision",{...call,...base});if(error)throw new Error("AG worker decision write outcome unknown: "+error.message);return typeof data==="string"?data:"";},
   async commitWatch(call){same(call.p_cycle_id);const {data,error}=await admin.rpc("ag_worker_commit_watch_operation",{...call,...base});if(error)throw new Error("AG worker watch write outcome unknown: "+error.message);return typeof data==="string"?data:"";},
   async verifyDecisionManifest(cycleId,kind){same(cycleId);const {data,error}=await admin.rpc("ag_worker_verify_decision_manifest",{...base,p_kind:kind});return !error&&data===true;},
   async verifyWatchManifest(cycleId){same(cycleId);const {data,error}=await admin.rpc("ag_worker_verify_cycle_watch_manifest",base);return !error&&data===true;},
   async complete(checkpointId,claimToken,expectedTickers){const {data,error}=await admin.rpc("ag_worker_complete_persistence_stage",{...base,p_checkpoint_id:checkpointId,p_claim_token:claimToken,p_expected_tickers:[...expectedTickers]});return !error&&data===true;},
  },
  finalization:{
   async claim(cycleId){same(cycleId);const row=await stageRpc.claim(cycleId,"finalized");return {checkpointId:row.checkpointId,claimToken:row.claimToken};},
   async finalize(checkpointId,claimToken){const {data,error}=await admin.rpc("ag_worker_finalize_daily_cycle",{...base,p_checkpoint_id:checkpointId,p_claim_token:claimToken});if(error)throw new Error("AG worker finalization outcome unknown: "+error.message);return data===true;},
  },
 };
}
