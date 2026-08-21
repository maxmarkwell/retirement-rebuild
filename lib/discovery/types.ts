export type DiscoveryPortfolioMode =
  | "paper_active"
  | "paper_long_term";

export type DiscoveryScoreBreakdown = {
  quality: number;
  growth: number;
  valuation: number;
  earnings: number;
  risk: number;
  portfolioFit: number;
};

export type DiscoveryCandidate = {
  ticker: string;

  portfolioMode:
    DiscoveryPortfolioMode;

  scores:
    DiscoveryScoreBreakdown;

  totalScore: number;

  reasonSummary: string;
};