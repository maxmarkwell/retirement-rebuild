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

export type ExperimentPortfolio = {
  id: string;
  type: string;
  starting_capital: number | string;
};

export type ExperimentComparisonPoint = {
  date: string;
  realPortfolio: number | null;
  paperLongTerm: number | null;
  benchmark: number | null;
};

function calculateSnapshotReturnPct(
  snapshot: PortfolioSnapshotRecord,
  startingCapital: number
) {
  const contributions = Number(
    snapshot.cumulative_contributions ?? 0
  );

  const withdrawals = Number(
    snapshot.cumulative_withdrawals ?? 0
  );

  const capitalBase =
    startingCapital + contributions - withdrawals;

  const investmentGrowth = Number(
    snapshot.investment_growth
  );

  return capitalBase > 0
    ? (investmentGrowth / capitalBase) * 100
    : 0;
}

export function buildExperimentComparisonSeries(
  snapshots: PortfolioSnapshotRecord[],
  portfolios: ExperimentPortfolio[]
): ExperimentComparisonPoint[] {
  const portfolioById = new Map(
    portfolios.map((portfolio) => [
      portfolio.id,
      portfolio,
    ])
  );

  const pointsByDate = new Map<
    string,
    ExperimentComparisonPoint
  >();

  for (const snapshot of snapshots) {
    const portfolio =
      portfolioById.get(snapshot.portfolio_id);

    if (
      !portfolio ||
      (portfolio.type !== "real" &&
        portfolio.type !== "paper_long_term" &&
        portfolio.type !== "benchmark")
    ) {
      continue;
    }

    const startingCapital = Number(
      portfolio.starting_capital
    );

    const returnPct =
      calculateSnapshotReturnPct(
        snapshot,
        startingCapital
      );

    const point =
      pointsByDate.get(snapshot.snapshot_date) ?? {
        date: snapshot.snapshot_date,
        realPortfolio: null,
        paperLongTerm: null,
        benchmark: null,
      };

    if (portfolio.type === "real") {
      point.realPortfolio = returnPct;
    }

    if (portfolio.type === "paper_long_term") {
      point.paperLongTerm = returnPct;
    }

    if (portfolio.type === "benchmark") {
      point.benchmark = returnPct;
    }

    pointsByDate.set(
      snapshot.snapshot_date,
      point
    );
  }

  return Array.from(pointsByDate.values()).sort(
    (a, b) =>
      new Date(a.date).getTime() -
      new Date(b.date).getTime()
  );
}
