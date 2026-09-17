export type AccelerationDirection =
  | "strongly_accelerating"
  | "accelerating"
  | "stable"
  | "decelerating"
  | "strongly_decelerating"
  | "insufficient_data";

export type QuarterlyGrowthPoint = {
  date: string | null;
  fiscalYear: string | null;
  period: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  freeCashFlow: number | null;
  revenueGrowthYoY: number | null;
  operatingMargin: number | null;
  freeCashFlowMargin: number | null;
};

export type TrajectoryMetrics = {
  latest: number | null;
  slope: number | null;
  recentChange: number | null;
  consistency: number | null;
  pointCount: number;
};

export type AcceleratedGrowthFundamentals = {
  symbol: string;
  quarters: QuarterlyGrowthPoint[];
  revenueAcceleration: number | null;
  operatingMarginChange: number | null;
  freeCashFlowMarginChange: number | null;
  revenueTrajectory: TrajectoryMetrics;
  operatingMarginTrajectory: TrajectoryMetrics;
  freeCashFlowMarginTrajectory: TrajectoryMetrics;
  accelerationDirection: AccelerationDirection;
  dataQuality: {
    quarterCount: number;
    comparableRevenueGrowthPoints: number;
    hasQuarterlyIncome: boolean;
    hasQuarterlyCashFlow: boolean;
    eligibleForScoring: boolean;
  };
};

export type AgScoreComponents = {
  fundamentalAcceleration: number;
  earningsConfirmation: number;
  businessQuality: number;
  valuationReward: number;
  marketConfirmation: number | null;
};

export type AgDiscoveryScore = {
  total: number;
  components: AgScoreComponents;
  version: "ag-discovery-v1";
};
