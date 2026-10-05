/**
 * Pure recovery classifier for an interrupted AG persistence stage.
 * It never writes, retries, reclaims a lease, or marks a checkpoint complete.
 */
export type AgPersistenceRecoveryEvidence={
 checkpointStatus:"running"|"completed"|"failed"|"needs_manual_review"|null;
 decisionManifestVerified:boolean;
 watchManifestVerified:boolean;
 completionVerified:boolean;
};
export type AgPersistenceRecoveryDisposition=
 |{action:"ALREADY_COMPLETE"}
 |{action:"COMPLETE_ONLY"}
 |{action:"MANUAL_RECONCILIATION";reason:string};

export function classifyAgPersistenceRecovery(
 e:AgPersistenceRecoveryEvidence,
):AgPersistenceRecoveryDisposition{
 if(!e||![null,"running","completed","failed","needs_manual_review"].includes(e.checkpointStatus))
  return {action:"MANUAL_RECONCILIATION",reason:"INVALID_EVIDENCE"};
 if(e.checkpointStatus==="completed")
  return e.completionVerified
   ?{action:"ALREADY_COMPLETE"}
   :{action:"MANUAL_RECONCILIATION",reason:"COMPLETED_CHECKPOINT_NOT_VERIFIED"};
 if(e.checkpointStatus!=="running")
  return {action:"MANUAL_RECONCILIATION",reason:"CHECKPOINT_NOT_RUNNING"};
 if(!e.decisionManifestVerified)
  return {action:"MANUAL_RECONCILIATION",reason:"DECISION_MANIFEST_INCOMPLETE"};
 if(!e.watchManifestVerified)
  return {action:"MANUAL_RECONCILIATION",reason:"WATCH_MANIFEST_INCOMPLETE"};
 if(e.completionVerified)
  return {action:"MANUAL_RECONCILIATION",reason:"INCONSISTENT_COMPLETION_STATE"};
 // All durable write postconditions are independently verified. Recovery may
 // attempt ONLY the completion RPC with the original still-valid claim.
 return {action:"COMPLETE_ONLY"};
}
