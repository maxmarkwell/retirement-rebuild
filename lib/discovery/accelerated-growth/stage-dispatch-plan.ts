import "server-only";
import {
  getAgWorkerCheckpointStatus,
  type AgWorkerAuthorization,
  type AgResearchStage,
} from "./authorized-stage-continuation";

const STAGES: AgResearchStage[] = [
  "holding_review", "discovery", "catalyst_deep_research",
  "committee", "persistence", "finalized",
];

export type AgStageDispatchPlan =
  | { action: "run"; stage: AgResearchStage; completedStages: AgResearchStage[] }
  | { action: "done"; completedStages: AgResearchStage[] }
  | { action: "manual_review"; stage: AgResearchStage; status: string; completedStages: AgResearchStage[] };

/**
 * Pure fail-closed scheduler. It does not claim work or dispatch requests.
 * A worker must check the authoritative state again when claiming the stage.
 */
export function planNextAgStage(
  rows: Array<{ stage: string; status: string }>,
): AgStageDispatchPlan {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!STAGES.includes(row.stage as AgResearchStage) || seen.has(row.stage)) {
      return { action: "manual_review", stage: "holding_review", status: "unexpected_or_duplicate_checkpoint", completedStages: [] };
    }
    seen.add(row.stage);
  }
  const completedStages: AgResearchStage[] = [];
  for (const stage of STAGES) {
    const row = rows.find(item => item.stage === stage);
    if (!row) {
      // Later stage rows may never exist before the first missing stage.
      if (rows.some(item => STAGES.indexOf(item.stage as AgResearchStage) > STAGES.indexOf(stage))) {
        return { action: "manual_review", stage, status: "out_of_order_checkpoint", completedStages };
      }
      return { action: "run", stage, completedStages };
    }
    if (row.status !== "completed") {
      return { action: "manual_review", stage, status: row.status, completedStages };
    }
    completedStages.push(stage);
  }
  return { action: "done", completedStages };
}

/** Authorization-scoped read-only continuation decision. */
export async function getNextAgWorkerStage(auth: AgWorkerAuthorization): Promise<AgStageDispatchPlan> {
  const rows = await getAgWorkerCheckpointStatus(auth);
  return planNextAgStage(rows);
}
