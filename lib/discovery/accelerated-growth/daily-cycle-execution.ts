import "server-only";
import { executeAgPaperBuy } from "./paper-execution";
import { executeAgPaperSell } from "./paper-sell-execution";
import type { PersistedAgCommitteeDecision } from "./committee-pipeline";
import type { PersistedAgHoldingReviewDecision } from "./holding-review-pipeline";

export type AgDailyCycleExecutionResult = {
  enabled: boolean;
  buyDecisionCount: number;
  sellDecisionCount: number;
  executedBuyCount: number;
  executedSellCount: number;
  buys: Array<Awaited<ReturnType<typeof executeAgPaperBuy>>>;
  sells: Array<Awaited<ReturnType<typeof executeAgPaperSell>>>;
};

export async function executeAgDailyCycleTransactions(input: {
  enabled: boolean;
  buyDecisions: PersistedAgCommitteeDecision[];
  holdingDecisions: PersistedAgHoldingReviewDecision[];
}): Promise<AgDailyCycleExecutionResult> {
  const buyDecisions = input.buyDecisions.filter((decision) => decision.decision === "BUY");
  const sellDecisions = input.holdingDecisions.filter((decision) => decision.decision === "SELL");

  if (!input.enabled) {
    return {
      enabled: false,
      buyDecisionCount: buyDecisions.length,
      sellDecisionCount: sellDecisions.length,
      executedBuyCount: 0,
      executedSellCount: 0,
      buys: [],
      sells: [],
    };
  }

  // SELL first. The BUY executor then re-reads accounting, valuation, cash,
  // position/theme exposure and guardrails from the post-SELL state.
  const sells: AgDailyCycleExecutionResult["sells"] = [];
  for (const decision of sellDecisions) {
    sells.push(await executeAgPaperSell({ decisionId: decision.decisionId }));
  }

  const buys: AgDailyCycleExecutionResult["buys"] = [];
  for (const decision of buyDecisions) {
    buys.push(await executeAgPaperBuy({ decisionId: decision.decisionId }));
  }

  return {
    enabled: true,
    buyDecisionCount: buyDecisions.length,
    sellDecisionCount: sellDecisions.length,
    executedBuyCount: buys.length,
    executedSellCount: sells.length,
    buys,
    sells,
  };
}

export async function executeAgDailyCycleSells(input: {
  enabled: boolean;
  decisions: PersistedAgHoldingReviewDecision[];
}) {
  const result = await executeAgDailyCycleTransactions({
    enabled: input.enabled,
    buyDecisions: [],
    holdingDecisions: input.decisions,
  });
  return {
    enabled: result.enabled,
    sellDecisionCount: result.sellDecisionCount,
    executedSellCount: result.executedSellCount,
    sells: result.sells,
  };
}
