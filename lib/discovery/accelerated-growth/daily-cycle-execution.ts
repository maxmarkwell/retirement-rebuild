import "server-only";
import { executeAgPaperBuy } from "./paper-execution";
import { assertAgPaperBuyAuthorized, type AgExecutionAuthorization } from "./buy-activation-policy";
import type { PersistedAgCommitteeDecision } from "./committee-pipeline";
import type { PersistedAgHoldingReviewDecision } from "./holding-review-pipeline";

export type AgDailyCycleExecutionResult = {
  enabled: boolean;
  buyDecisionCount: number;
  sellDecisionCount: number;
  executedBuyCount: number;
  executedSellCount: number;
  buys: Array<Awaited<ReturnType<typeof executeAgPaperBuy>>>;
  sells: [];
};

export async function executeAgDailyCycleTransactions(input: {
  enabled: boolean;
  buyDecisions: PersistedAgCommitteeDecision[];
  holdingDecisions: PersistedAgHoldingReviewDecision[];
}): Promise<AgDailyCycleExecutionResult> {
  const buyDecisionCount = input.buyDecisions.filter((d) => d.decision === "BUY").length;
  const sellDecisionCount = input.holdingDecisions.filter((d) => d.decision === "SELL").length;
  if (input.enabled) throw new Error("AG_COMBINED_EXECUTION_DISABLED");
  return {
    enabled: false, buyDecisionCount, sellDecisionCount,
    executedBuyCount: 0, executedSellCount: 0, buys: [], sells: [],
  };
}

export async function executeAgDailyCycleSells(input: {
  enabled: boolean;
  decisions: PersistedAgHoldingReviewDecision[];
}) {
  const result = await executeAgDailyCycleTransactions({
    enabled: input.enabled, buyDecisions: [], holdingDecisions: input.decisions,
  });
  return {
    enabled: result.enabled,
    sellDecisionCount: result.sellDecisionCount,
    executedSellCount: result.executedSellCount,
    sells: result.sells,
  };
}

/** Only an independently approved and reconciled paper BUY flow may call this.
 * Never processes SELL decisions or touches the Real Portfolio.
 */
export async function executeAgAuthorizedPaperBuys(input: {
  authorization: AgExecutionAuthorization;
  buyDecisions: PersistedAgCommitteeDecision[];
}): Promise<AgDailyCycleExecutionResult> {
  assertAgPaperBuyAuthorized(input.authorization);
  const buyDecisions = input.buyDecisions.filter((d) => d.decision === "BUY");
  const buys: AgDailyCycleExecutionResult["buys"] = [];
  for (const decision of buyDecisions) {
    buys.push(await executeAgPaperBuy({ decisionId: decision.decisionId }));
  }
  return {
    enabled: true, buyDecisionCount: buyDecisions.length,
    sellDecisionCount: 0, executedBuyCount: buys.length,
    executedSellCount: 0, buys, sells: [],
  };
}
