import "server-only";
import { executeAgPaperBuy } from "./paper-execution";
import { executeAgPaperSell } from "./paper-sell-execution";
import type { PersistedAgHoldingReviewDecision } from "./holding-review-pipeline";

export type AgPersistedNewCandidateDecision = {
  id: string;
  ticker: string;
  decision_type: string;
  status: string;
};

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
  buyDecisions: AgPersistedNewCandidateDecision[];
  holdingDecisions: PersistedAgHoldingReviewDecision[];
}): Promise<AgDailyCycleExecutionResult> {
  const buyDecisions = input.buyDecisions.filter(
    (decision) => decision.decision_type === "buy" && decision.status === "active"
  );
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

  // SELL first. This prevents a same-cycle BUY from consuming cash/sleeve capacity
  // that an already-owned position has been adjudicated to exit, and makes the
  // subsequent BUY executor re-read the post-SELL accounting/valuation state.
  const sells: AgDailyCycleExecutionResult["sells"] = [];
  for (const decision of sellDecisions) {
    sells.push(await executeAgPaperSell({ decisionId: decision.decisionId }));
  }

  const buys: AgDailyCycleExecutionResult["buys"] = [];
  for (const decision of buyDecisions) {
    buys.push(await executeAgPaperBuy({ decisionId: decision.id }));
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

// Narrow helper retained for zero-execution diagnostics and callers that only
// need to prove the SELL gate without constructing new-candidate decisions.
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
