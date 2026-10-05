export type AgCycleFinalizationEvidence={
 cycleStatus:"running"|"completed"|"failed"|string|null;
 persistenceStatus:"completed"|"running"|"failed"|"needs_manual_review"|null;
 persistenceOutputPresent:boolean;
 decisionManifestVerified:boolean;
 watchManifestVerified:boolean;
};

export type AgCycleFinalizationDisposition=
 |{action:"ALREADY_COMPLETE"}
 |{action:"FINALIZE"}
 |{action:"WAIT";reason:string}
 |{action:"MANUAL_RECONCILIATION";reason:string};

/**
 * Pure fail-closed classifier. It never writes cycle state and never grants
 * transaction authority.
 */
export function classifyAgCycleFinalization(
 e:AgCycleFinalizationEvidence,
):AgCycleFinalizationDisposition{
 if(!e||!["running","completed","failed"].includes(e.cycleStatus??""))
  return {action:"MANUAL_RECONCILIATION",reason:"INVALID_CYCLE_STATE"};
 if(e.cycleStatus==="completed")
  return e.persistenceStatus==="completed"&&e.persistenceOutputPresent&&
   e.decisionManifestVerified&&e.watchManifestVerified
   ?{action:"ALREADY_COMPLETE"}
   :{action:"MANUAL_RECONCILIATION",reason:"COMPLETED_CYCLE_POSTCONDITION_MISMATCH"};
 if(e.cycleStatus==="failed")
  return {action:"MANUAL_RECONCILIATION",reason:"FAILED_CYCLE_REQUIRES_REVIEW"};
 if(e.persistenceStatus===null||e.persistenceStatus==="running")
  return {action:"WAIT",reason:"PERSISTENCE_NOT_COMPLETE"};
 if(e.persistenceStatus!=="completed")
  return {action:"MANUAL_RECONCILIATION",reason:"PERSISTENCE_NOT_COMPLETED_CLEANLY"};
 if(!e.persistenceOutputPresent)
  return {action:"MANUAL_RECONCILIATION",reason:"PERSISTENCE_OUTPUT_MISSING"};
 if(!e.decisionManifestVerified)
  return {action:"MANUAL_RECONCILIATION",reason:"DECISION_MANIFEST_NOT_VERIFIED"};
 if(!e.watchManifestVerified)
  return {action:"MANUAL_RECONCILIATION",reason:"WATCH_MANIFEST_NOT_VERIFIED"};
 return {action:"FINALIZE"};
}
