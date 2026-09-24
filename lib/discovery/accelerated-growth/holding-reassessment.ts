import "server-only";
import { getAgOperationalState } from "./operational-state";

export type AgHoldingReassessmentCandidate = {
  ticker: string;
  quantity: number;
  cost: number;
  price: number;
  marketValue: number;
  themeKey: string;
  latestDecisionId: string | null;
  latestDecisionType: string | null;
  latestDecisionStatus: string | null;
  latestDecisionThesis: string | null;
  latestDecisionCreatedAt: string | null;
};

export async function getAgHoldingReassessmentCandidates(): Promise<{
  portfolioId: string;
  eraId: string;
  candidates: AgHoldingReassessmentCandidate[];
}> {
  const state = await getAgOperationalState();

  const candidates = state.holdings.map((holding) => {
    if (!holding.themeKey) {
      throw new Error(`AG holding reassessment blocked: ${holding.ticker} has no theme attribution.`);
    }
    if (!Number.isFinite(holding.quantity) || holding.quantity <= 0) {
      throw new Error(`AG holding reassessment blocked: ${holding.ticker} has invalid quantity.`);
    }
    if (!Number.isFinite(holding.price) || holding.price <= 0) {
      throw new Error(`AG holding reassessment blocked: ${holding.ticker} has no valid current valuation.`);
    }

    const latest = state.recentDecisions.find((decision) => decision.ticker?.toUpperCase() === holding.ticker);

    return {
      ticker: holding.ticker,
      quantity: holding.quantity,
      cost: holding.cost,
      price: holding.price,
      marketValue: holding.marketValue,
      themeKey: holding.themeKey,
      latestDecisionId: latest?.id ?? null,
      latestDecisionType: latest?.decision_type ?? null,
      latestDecisionStatus: latest?.status ?? null,
      latestDecisionThesis: latest?.thesis ?? null,
      latestDecisionCreatedAt: latest?.created_at ?? null,
    };
  });

  return {
    portfolioId: state.portfolioId,
    eraId: state.eraId,
    candidates,
  };
}
