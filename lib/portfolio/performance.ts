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

export type PortfolioPerformanceSummary = {
  startingValue: number;
  currentValue: number;
  returnPct: number;
  dollarGain: number;
  snapshotCount: number;
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

export function calculatePerformanceSummary(
  series: PerformanceSeriesPoint[],
  startingCapital: number
): PortfolioPerformanceSummary {
  if (series.length === 0) {
    return {
      startingValue: startingCapital,
      currentValue: startingCapital,
      returnPct: 0,
      dollarGain: 0,
      snapshotCount: 0,
    };
  }

  const latest =
    series[series.length - 1];

  const currentValue =
    latest.totalValue;

  const dollarGain =
    currentValue - startingCapital;

  const returnPct =
    startingCapital > 0
      ? (dollarGain / startingCapital) * 100
      : 0;

  return {
    startingValue: startingCapital,
    currentValue,
    returnPct,
    dollarGain,
    snapshotCount: series.length,
  };
}