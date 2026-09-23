import "server-only";
import { executeAgPaperSell } from "./paper-sell-execution";
import type { PersistedAgHoldingReviewDecision } from "./holding-review-pipeline";

export type AgDailyCycleExecutionResult = {
  enabled: boolean;
  sellDecisionCount: number;
  executedSellCount: number;
  sells: Array<Awaited<ReturnType<typeof executeAgPaperSell>>>;
};

export async function executeAgDailyCycleSells(input: {
  enabled: boolean;
  decisions: PersistedAgHoldingReviewDecision[];
}): Promise<AgDailyCycleExecutionResult> {
  const sellDecisions = input.decisions.filter((decision) => decision.decision === "SELL");
  if (!input.enabled || sellDecisions.length === 0) {
    return { enabled: input.enabled, sellDecisionCount: sellDecisions.length, executedSellCount: 0, sells: [] };
  }

  const sells: AgDailyCycleExecutionResult["sells"] = [];
  for (const decision of sellDecisions) {
    // Reused active SELL decisions are still eligible: if they were already executed,
    // their status would no longer be active and persistence would not have reused them.
    sells.push(await executeAgPaperSell({ decisionId: decision.decisionId }));
  }
  return { enabled: true, sellDecisionCount: sellDecisions.length, executedSellCount: sells.length, sells };
}
