import test from "node:test";
import assert from "node:assert/strict";
import {classifyAgPersistenceRecovery} from "./persistence-recovery-contract";

test("completed checkpoint requires independent completion verification",()=>{
 assert.deepEqual(classifyAgPersistenceRecovery({checkpointStatus:"completed",decisionManifestVerified:true,watchManifestVerified:true,completionVerified:true}),{action:"ALREADY_COMPLETE"});
 assert.equal(classifyAgPersistenceRecovery({checkpointStatus:"completed",decisionManifestVerified:true,watchManifestVerified:true,completionVerified:false}).action,"MANUAL_RECONCILIATION");
});
test("running stage can only complete when both durable manifests verify",()=>{
 assert.deepEqual(classifyAgPersistenceRecovery({checkpointStatus:"running",decisionManifestVerified:true,watchManifestVerified:true,completionVerified:false}),{action:"COMPLETE_ONLY"});
 assert.equal(classifyAgPersistenceRecovery({checkpointStatus:"running",decisionManifestVerified:false,watchManifestVerified:true,completionVerified:false}).action,"MANUAL_RECONCILIATION");
 assert.equal(classifyAgPersistenceRecovery({checkpointStatus:"running",decisionManifestVerified:true,watchManifestVerified:false,completionVerified:false}).action,"MANUAL_RECONCILIATION");
});
test("failed/manual/missing checkpoints never authorize replay or completion",()=>{
 for(const status of ["failed","needs_manual_review",null])
  assert.equal(classifyAgPersistenceRecovery({checkpointStatus:status,decisionManifestVerified:true,watchManifestVerified:true,completionVerified:false}).action,"MANUAL_RECONCILIATION");
});
test("inconsistent running/completed evidence fails closed",()=>{
 assert.equal(classifyAgPersistenceRecovery({checkpointStatus:"running",decisionManifestVerified:true,watchManifestVerified:true,completionVerified:true}).action,"MANUAL_RECONCILIATION");
});
