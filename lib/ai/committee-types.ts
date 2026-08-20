export type CommitteePortfolioMode =
  | "paper_active"
  | "paper_long_term";

export type SpecialistAnalysis = {
  ticker: string;
  researchAnalysis: string;
  bullCase: string;
  bearCase: string;
  riskAnalysis: string;
  portfolioAnalysis: string;
};

export type CommitteeDecision =
  | "buy"
  | "sell"
  | "hold"
  | "watch"
  | "avoid"
  | "rebalance";

export type CommitteeRiskLevel =
  | "low"
  | "medium"
  | "high";

export type CommitteeFinalDecision = {
  recommendation: CommitteeDecision;
  confidence: number;
  riskLevel: CommitteeRiskLevel;
  recommendedAllocation: number | null;
  expectedHoldingPeriod: string | null;
  finalThesis: string;
  reassessmentConditions: string | null;
  exitConditions: string | null;
};

export type CommitteeRunResult = {
  ticker: string;
  marketPrice: number | null;
  specialistAnalysis: SpecialistAnalysis;
  finalDecision: CommitteeFinalDecision;
  specialistModel: string;
  chairModel: string;
  promptVersion: string;
};