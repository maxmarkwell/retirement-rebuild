import "server-only";
import type {AgStageCheckpointRpc} from "./stage-checkpoint-capture";
import type {AgCheckpointStatus} from "./stage-checkpoint-status-reader";
import type {AgSymbolCheckpointIo} from "./symbol-checkpoint-orchestrator";
import type {AgStage} from "./stage-checkpoint-contract";

export type AgCycleExecutionContext={
 cycleId:string;
 userId:string;
 readCheckpointStatus:(cycleId:string)=>Promise<AgCheckpointStatus[]>;
 createStageRpc:()=>Promise<AgStageCheckpointRpc>;
 reclaimExpiredSymbolParent:(cycleId:string,stage:"catalyst_deep_research"|"committee")=>Promise<{checkpointId:string;claimToken:string;stage:"catalyst_deep_research"|"committee"}>;
 createSymbolIo:()=>Promise<AgSymbolCheckpointIo>;
 readCompletedStageOutput:(input:{cycleId:string;stage:AgStage})=>Promise<any>;
 readDiscoveryContext?:()=>Promise<any>;
 markStageNeedsReview?:(checkpointId:string,errorMessage:string)=>Promise<boolean>;
};

/**
 * Trust boundary shared by browser and autonomous-worker execution.
 * Implementations must bind every operation to this exact cycle/user pair.
 */
export function assertAgExecutionContext(ctx:AgCycleExecutionContext,cycleId:string){
 if(ctx.cycleId!==cycleId)throw new Error("AG execution context cycle mismatch.");
 if(!ctx.userId)throw new Error("AG execution context user identity missing.");
}
