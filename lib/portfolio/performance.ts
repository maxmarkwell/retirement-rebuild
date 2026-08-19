export type PortfolioSnapshotRecord = {
  portfolio_id: string;
  snapshot_date: string;
  total_value: number | string;
  cash_value: number | string;
  holdings_value: number | string;
  cumulative_contributions: number | string;
  cumulative_withdrawals: number | string;
  investment_growth: number | string;
};

export type PerformanceSeriesPoint = {
  date: string;
  totalValue: number;
  cashValue: number;
  holdingsValue: number;
  investmentGrowth: number;
};

export function buildPerformanceSeries(
  snapshots: PortfolioSnapshotRecord[]
): PerformanceSeriesPoint[] {
  return snapshots
    .map((snapshot) => ({
      date: snapshot.snapshot_date,
      totalValue: Number(snapshot.total_value),
      cashValue: Number(snapshot.cash_value),
      holdingsValue: Number(snapshot.holdings_value),
      investmentGrowth: Number(snapshot.investment_growth),
    }))
    .sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime()
    );
}